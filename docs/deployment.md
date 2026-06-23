# Deployment

This guide walks through deploying the AWS MCP Gateway to Cloudflare Workers, configuring runtime settings, and verifying the deployment.

## Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- [pnpm](https://pnpm.io/installation) (see `packageManager` in `package.json` for the exact version)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed and authenticated against your Cloudflare account
- A Cloudflare account with Workers enabled
- An AWS IAM user with the [read-only policy](../infra/aws/iam-readonly-policy.json) attached and its access key generated

If you have not created the IAM user yet, follow the [AWS IAM setup guide](aws-iam-setup.md) first.

## Local install

```bash
pnpm install
```

## Quality checks

Use a **minimal local loop** during day-to-day development:

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

Run the **full pre-deploy validation** block before `pnpm deploy` or opening a pull request:

```bash
pnpm run repo:safety
pnpm run output:guardrail
pnpm run verify:connector-contract
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

- `pnpm run repo:safety` — Tracked files stay public-safe (no secrets or maintainer defaults).
- `pnpm run output:guardrail` — Production source routes output through `src/observability/`.
- `pnpm run verify:connector-contract` — Local ChatGPT Connector contract gate (manifest, policy, capability, exposure, descriptors, `tools/list`).
- `pnpm run typecheck` — TypeScript type checking.
- `pnpm test` — Unit tests (offline, no network calls required).
- `pnpm run test:integrity` — Ensures no focused or unjustified skipped tests.

`verify:connector-contract` runs typecheck, unit tests, and test-integrity checks; the last three commands are listed explicitly for parity with CI. All six must pass before deploying.

**CI on every PR and `main` push:**

- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `repo:safety`, `output:guardrail`, `verify:connector-contract`
- [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml) — Gitleaks secret-pattern scanning

See [README.md](../README.md#testing) for the same validation tiers.

## Runtime configuration

The Worker requires a mix of Cloudflare-managed secrets and non-secret configuration variables.

### Wrangler config template

| File | Purpose |
|------|---------|
| [`wrangler.example.jsonc`](../wrangler.example.jsonc) | Reusable template with placeholders and inline comments — copy when starting a new deployment |
| [`wrangler.jsonc`](../wrangler.jsonc) | Generic tracked config with placeholders — replace worker host, Auth0 tenant, and KV namespace id before OAuth production deploy |

Before deploying your own connector, copy `wrangler.example.jsonc` to `wrangler.jsonc` (or edit the tracked file) and replace:

- `<your-worker-host>` — your Cloudflare Worker URL host
- `<your-auth0-tenant>` — Auth0 domain (or compatible OIDC issuer host)
- `<your-kv-namespace-id>` — KV namespace id from `wrangler kv:namespace create`

**Secrets vs non-secrets:**

- **Secrets** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `MCP_AUTH_TOKEN` in local-bearer mode) belong in Cloudflare secrets via `wrangler secret put` — never in Git or `[vars]`.
- **OAuth vars** (`MCP_RESOURCE_URL`, `OAUTH_ISSUER`, etc.) are deployment-specific but not secret — they belong in `[vars]` or the Cloudflare dashboard.
- **Local helper files** (`.dev.vars`, `.env`, `.env.deploy.local`) and Cloudflare API tokens must never be committed.

### Required secrets (configure with `wrangler secret put`)

These values are sensitive and must be stored in Cloudflare's encrypted secrets store. They are never written to `wrangler.jsonc` or committed to Git.

**Always required:**

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

**Local bearer mode only** (`AUTH_MODE=local-bearer` or absent):

```bash
wrangler secret put MCP_AUTH_TOKEN
# Strong random bearer token for local dev or non-ChatGPT clients.
```

**ChatGPT OAuth production mode** (`AUTH_MODE=oauth`): `MCP_AUTH_TOKEN` is **not** required. See [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

For the runtime authentication lifecycle and route-by-route behavior, see
[auth/README.md](auth/README.md), [auth/oauth-lifecycle.md](auth/oauth-lifecycle.md),
and [auth/token-validation.md](auth/token-validation.md).

### Auth modes

| Mode | Use case | `MCP_AUTH_TOKEN` | OAuth vars |
|------|----------|------------------|------------|
| `local-bearer` (default) | Local `pnpm dev`, curl testing | Required (secret) | Not used |
| `oauth` | ChatGPT connector production | Not required | Required in `[vars]` plus `AUTH_RATE_LIMITER` Durable Object binding |

OAuth vars (non-secret, safe in `wrangler.jsonc` or dashboard):

```jsonc
{
  "vars": {
    "AUTH_MODE": "oauth",
    "RATE_LIMIT_MAX_REQUESTS": "120",
    "RATE_LIMIT_WINDOW_SECONDS": "60",
    "MCP_RESOURCE_URL": "https://<worker-host>",
    "OAUTH_ISSUER": "https://<auth-provider-domain>/",
    "OAUTH_AUDIENCE": "https://<worker-host>",
    "OAUTH_TOKEN_VALIDATION_MODE": "jwks",
    "OAUTH_JWKS_URI": "https://<auth-provider-domain>/.well-known/jwks.json",
    "OAUTH_REQUIRED_SCOPES": "aws:read"
  }
}
```

To support opaque access tokens from providers that expose RFC 7662 introspection, switch to:

```jsonc
{
  "vars": {
    "OAUTH_TOKEN_VALIDATION_MODE": "introspection",
    "OAUTH_INTROSPECTION_URL": "https://<auth-provider-domain>/oauth/introspect"
  }
}
```

and configure `OAUTH_INTROSPECTION_CLIENT_ID` / `OAUTH_INTROSPECTION_CLIENT_SECRET` as Worker secrets.

For a mode-by-mode comparison of `jwks`, `introspection`, and `hybrid`, see
[auth/token-validation.md](auth/token-validation.md).

Keep committed `wrangler.jsonc` and [`wrangler.example.jsonc`](../wrangler.example.jsonc) production-neutral (placeholders only). Set real worker host, Auth0 tenant, and KV namespace id in the Cloudflare dashboard, CI deploy overrides, or `.env.deploy.local` for setup scripts — never commit live tenant, host, or KV namespace values. When changing Wrangler structure, edit the example file first and mirror the same shape into `wrangler.jsonc`.

### Required configuration (configure in `wrangler.jsonc` `[vars]`)

These values are operational configuration, not credentials. They are safe to commit and review.

Open `wrangler.jsonc` and ensure the `[vars]` section contains:

```jsonc
{
  "vars": {
    "AWS_REGION": "us-east-1",
    "AWS_ALLOWED_REGIONS": "us-east-1,sa-east-1"
  }
}
```

- `AWS_REGION` — The default AWS region for global tools (e.g. Cost Explorer).
- `AWS_ALLOWED_REGIONS` — A comma-separated list of regions that regional tools may query. The default region must be included.
- `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS` — request budget enforced before the MCP runtime in OAuth mode.

### Optional tool exposure controls

Configure in `[vars]` or the Cloudflare dashboard. Defaults expose **11** of **14** registered tools via packs `core`, `cost`, `inventory`, and `observability`. The `aggregates` pack (+3 overview tools) is opt-in.

Disabled or pack-gated tools are omitted from `tools/list` and return a safe validation error if invoked by name. See [README.md](../README.md#tool-exposure-optional) for pack mappings and examples.

```jsonc
{
  "vars": {
    // Recommended default (omit to use built-in defaults):
    // "AWS_MCP_ENABLED_TOOL_PACKS": "core,cost,inventory,observability",
    // "AWS_MCP_MAX_RISK_LEVEL": "read-only"
  }
}
```

| Variable | Default | Notes |
|----------|---------|-------|
| `AWS_MCP_ENABLED_TOOL_PACKS` | `core,cost,inventory,observability` | Comma-separated pack names |
| `AWS_MCP_ENABLED_TOOLS` | *(empty)* | Optional explicit allowlist |
| `AWS_MCP_DISABLED_TOOLS` | *(empty)* | Deny specific tools |
| `AWS_MCP_MAX_RISK_LEVEL` | `read-only` | Only `read-only` is supported today |

Packs map to tools as documented in [README.md](../README.md#tool-exposure-optional). Enabling fewer packs is preferred for least privilege — for example, `AWS_MCP_ENABLED_TOOL_PACKS=cost` exposes only the two Cost Explorer tools. Add `core` when ChatGPT `search` / `fetch` helpers are required.

Unknown pack or tool names fail Worker startup validation.

### Required rate-limiter Durable Object

OAuth deployments must bind the `AUTH_RATE_LIMITER` Durable Object and include the matching migration:

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "AUTH_RATE_LIMITER",
        "class_name": "AuthRateLimitDurableObject"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["AuthRateLimitDurableObject"]
    }
  ]
}
```

### Optional KV namespace

Cost Explorer, EC2, CloudWatch, and Logs results can be cached in a Cloudflare KV namespace to reduce AWS API calls and cost.

Create the namespace:

```bash
wrangler kv:namespace create "AWS_MCP_CACHE"
```

Copy the returned `id` into `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "AWS_MCP_CACHE",
      "id": "<your-kv-namespace-id>"
    }
  ]
}
```

If the KV binding is absent, all tool calls proceed without caching. This is acceptable for evaluation but not recommended for regular use.

## Local credential files

Use **project-prefixed** names for deploy credentials so they do not clash with other Cloudflare or AWS tooling on your machine.

| File | Purpose | Variable naming |
| --- | --- | --- |
| `.dev.vars` | `pnpm dev` Worker runtime | Fixed binding names (`AWS_ACCESS_KEY_ID`, `MCP_AUTH_TOKEN`, …) required by the Worker code |
| `.env.deploy.local` | `wrangler secret put` / deploy | `AWS_MCP_GATEWAY_*` prefixes (see [`.env.deploy.example`](../.env.deploy.example)) |

Copy the examples and fill in values:

```bash
cp .dev.vars.example .dev.vars
cp .env.deploy.example .env.deploy.local
```

Wrangler only reads `CLOUDFLARE_API_TOKEN` from the shell. Store the token as `AWS_MCP_GATEWAY_CLOUDFLARE_API_TOKEN` in `.env.deploy.local`; the deploy scripts map it automatically. If you use `wrangler login`, the Cloudflare token is optional.

Sync Worker secrets from `.env.deploy.local` (no rollout; `wrangler secret put` only):

```bash
pnpm run sync-secrets
```

Sync secrets and `wrangler.jsonc` vars without a code deploy (`wrangler versions upload` + `wrangler versions deploy`):

```bash
pnpm run sync-config
```

Edit `wrangler.jsonc` before running `sync-config` when OAuth URLs, region allowlists, or other public vars change.

Sync secrets and deploy in one step:

```bash
pnpm run deploy:configured
```

Do **not** put `CLOUDFLARE_API_TOKEN` in `.dev.vars` — that file is injected into the Worker during local dev and is not used for Wrangler authentication.

## Deploy

```bash
pnpm deploy
```

This runs `wrangler deploy`, which uploads the Worker to Cloudflare and outputs the deployment URL. The MCP endpoint will be available at:

```text
https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp
```

The health endpoint is at:

```text
https://aws-mcp-gateway.<your-subdomain>.workers.dev/health
```

A custom domain can be added later through the Cloudflare dashboard, but it is not required for the current read-only scope.

## Verification

Verify the deployment is working before connecting an MCP client.

### 1. Health check

The `/health` endpoint does not require authentication. It should return a 200 response:

```bash
curl https://aws-mcp-gateway.<your-subdomain>.workers.dev/health
```

Expected response:

```json
{
  "ok": true,
  "service": "aws-mcp-gateway"
}
```

### 2. Unauthenticated MCP request

The `/mcp` endpoint must reject requests without valid authentication.

**OAuth mode** (`AUTH_MODE=oauth`): expect `401` with a `WWW-Authenticate` header containing `resource_metadata`:

```bash
curl -i -X POST https://<worker-host>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Local bearer mode**: expect `401` without `WWW-Authenticate`:

```bash
curl -X POST https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected response body (401):

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Authentication is required.",
    "retryable": false
  }
}
```

The same response should be returned for an invalid token:

```bash
curl -X POST https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### 3. Authenticated MCP connection

**Local bearer mode** — with a valid `MCP_AUTH_TOKEN`:

```bash
curl -X POST https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A successful response includes a `result` object with a `tools` array containing all **enabled** MCP tools for this deployment (11 by default).

**OAuth mode** — complete authentication through the ChatGPT connector UI. Do not copy OAuth access tokens into shell history. See [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

For a non-UI smoke check, run `pnpm run verify:oauth:authenticated` with either `AWS_MCP_GATEWAY_ACCESS_TOKEN` or the smoke OAuth client variables from `.env.deploy.local`.

### GitHub Actions: Connector Smoke workflow

Quality gates run on every PR and `main` push via [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`repo:safety`, `output:guardrail`, `verify:connector-contract`) and [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml) (Gitleaks). The separate **Connector Smoke** workflow (`.github/workflows/connector-smoke.yml`) is **manual only** (`workflow_dispatch`) so deployed validation against a live Worker does not run automatically with repository secrets.

To run it after deployment:

1. In the GitHub repository, configure Actions secrets: `AWS_MCP_GATEWAY_WORKER_URL`, `AWS_MCP_GATEWAY_OAUTH_TOKEN_URL`, `AWS_MCP_GATEWAY_OAUTH_CLIENT_ID`, `AWS_MCP_GATEWAY_OAUTH_CLIENT_SECRET`, and optionally `AWS_MCP_GATEWAY_OAUTH_AUDIENCE`, `AWS_MCP_GATEWAY_OAUTH_SCOPE`, and `AWS_MCP_GATEWAY_SMOKE_REGION`.
2. Open **Actions → Connector Smoke → Run workflow**.
3. Confirm both jobs pass: `contract` (local connector contract) and `deployed-smoke` (authenticated MCP checks against the deployed Worker). CI logs use quiet output; for full JSON responses, run `pnpm run verify:oauth:authenticated` locally.

### 4. Tool smoke tests

After confirming the MCP connection works, run smoke tests for a subset of tools. See [mcp-testing.md](mcp-testing.md) for the recommended smoke test sequence and expected failure behavior.

## Rollback

Cloudflare Workers maintains a history of deployed versions. To roll back:

```bash
wrangler versions list
wrangler rollback
# or specify a version:
wrangler versions rollback --version <id>
```

To redeploy after a configuration change (e.g. updated secrets or vars), run `pnpm deploy` again. This creates a new version without downtime.

## Security documentation contract

- Sensitive runtime values (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are configured via `wrangler secret put` outside Git.
- `MCP_AUTH_TOKEN` is required only in `local-bearer` mode.
- OAuth production deployments use `AUTH_MODE=oauth` without `MCP_AUTH_TOKEN`.
- `AWS_ALLOWED_REGIONS` is operational configuration, not a credential, and belongs in `wrangler.jsonc` `[vars]`.
- The gateway is read-only in the current scope. IAM permissions are explicitly scoped and do not include write or management actions.
- Local-only env files (`.dev.vars`) and generated platform state (`.wrangler/`) must not be committed.
- Cost Explorer and regional tools may make live AWS calls during manual MCP testing — be aware of AWS API costs before running repeated queries.
