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

Run the following commands before deploying to catch issues early:

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

- `pnpm run typecheck` — TypeScript type checking.
- `pnpm test` — Unit tests (offline, no network calls required).
- `pnpm run test:integrity` — Ensures no focused or unjustified skipped tests.

All three should pass before deploying.

## Runtime configuration

The Worker requires a mix of Cloudflare-managed secrets and non-secret configuration variables.

### Required secrets (configure with `wrangler secret put`)

These values are sensitive and must be stored in Cloudflare's encrypted secrets store. They are never written to `wrangler.jsonc` or committed to Git.

**Always required:**

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

**Legacy bearer mode only** (`AUTH_MODE=legacy-bearer` or absent):

```bash
wrangler secret put MCP_AUTH_TOKEN
# Strong random bearer token for local dev or non-ChatGPT clients.
```

**ChatGPT OAuth production mode** (`AUTH_MODE=oauth`): `MCP_AUTH_TOKEN` is **not** required. See [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

### Auth modes

| Mode | Use case | `MCP_AUTH_TOKEN` | OAuth vars |
|------|----------|------------------|------------|
| `legacy-bearer` (default) | Local `pnpm dev`, curl testing | Required (secret) | Not used |
| `oauth` | ChatGPT connector production | Not required | Required in `[vars]` |

OAuth vars (non-secret, safe in `wrangler.jsonc` or dashboard):

```jsonc
{
  "vars": {
    "AUTH_MODE": "oauth",
    "MCP_RESOURCE_URL": "https://<worker-host>",
    "OAUTH_ISSUER": "https://<auth-provider-domain>/",
    "OAUTH_AUDIENCE": "https://<worker-host>",
    "OAUTH_JWKS_URI": "https://<auth-provider-domain>/.well-known/jwks.json",
    "OAUTH_REQUIRED_SCOPES": "aws:read"
  }
}
```

Keep committed `wrangler.jsonc` production-neutral if you prefer — document OAuth placeholders here and set values in the Cloudflare dashboard per environment.

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

Sync Worker secrets from `.env.deploy.local`:

```bash
pnpm run sync-secrets
```

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

A custom domain can be added later through the Cloudflare dashboard, but it is not required for the MVP.

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

**Legacy bearer mode**: expect `401` without `WWW-Authenticate`:

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

**Legacy bearer mode** — with a valid `MCP_AUTH_TOKEN`:

```bash
curl -X POST https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A successful response includes a `result` object with a `tools` array containing all registered MCP tools.

**OAuth mode** — complete authentication through the ChatGPT connector UI. Do not copy OAuth access tokens into shell history. See [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

### 4. Tool smoke tests

After confirming the MCP connection works, run smoke tests for a subset of tools. See [docs/mcp-testing.md](mcp-testing.md) for the recommended smoke test sequence and expected failure behavior.

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
- `MCP_AUTH_TOKEN` is required only in `legacy-bearer` mode.
- OAuth production deployments use `AUTH_MODE=oauth` without `MCP_AUTH_TOKEN`.
- `AWS_ALLOWED_REGIONS` is operational configuration, not a credential, and belongs in `wrangler.jsonc` `[vars]`.
- The MVP is read-only. IAM permissions are explicitly scoped and do not include write or management actions.
- Local-only env files (`.dev.vars`) and generated platform state (`.wrangler/`) must not be committed.
- Cost Explorer and regional tools may make live AWS calls during manual MCP testing — be aware of AWS API costs before running repeated queries.
