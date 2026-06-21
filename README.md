# AWS MCP Gateway

A minimal, security-focused MCP gateway for connecting ChatGPT to AWS account data through explicit, read-only tools.

The initial goal is to expose AWS cost, inventory and observability data to ChatGPT without giving the model direct or generic access to AWS APIs. The gateway runs as a Cloudflare Worker, exposes an MCP endpoint over HTTPS and calls AWS APIs using tightly scoped credentials stored as Cloudflare secrets.

## Goals

- Provide a remote MCP endpoint for ChatGPT.
- Start with read-only AWS tools for cost, EC2 inventory, CloudWatch alarms and recent log errors.
- Keep the infrastructure small enough for personal use and low-cost operation.
- Avoid over-engineering while preserving the minimum security controls required for AWS data access.
- Keep the repository public-safe by storing all secrets outside Git.

## Non-goals

- No generic AWS CLI execution tool.
- No arbitrary AWS API proxy.
- No write or management operations in the MVP.
- No dashboard or database in the initial version.
- No Kubernetes, ECS, App Runner or long-running server requirement for the MVP.

## Architecture

```text
ChatGPT
  -> Remote MCP connector over HTTPS
  -> Cloudflare Worker MCP Gateway
  -> Explicit MCP tools
  -> AWS signed API requests
  -> AWS Cost Explorer, EC2, CloudWatch, CloudWatch Logs and Budgets
```

The Worker acts as a policy and translation layer. ChatGPT calls strongly typed MCP tools, and the Worker decides which AWS APIs are allowed to run.

## Recommended stack

- TypeScript
- Cloudflare Workers
- Cloudflare Workers KV for optional cache
- Cloudflare Secrets for credentials and auth configuration
- MCP SDK / Cloudflare Agents MCP helpers
- `aws4fetch` or AWS SDK v3 for signed AWS requests
- Zod for input validation
- Wrangler for local development and deployment
- GitHub Actions for CI

## Security model

The MVP must remain read-only. Post-MVP expansion (write operations, broader inventory) is governed by [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md).

ChatGPT connector OAuth is specified in [docs/specs/oauth-chatgpt-connector.md](docs/specs/oauth-chatgpt-connector.md). For production ChatGPT setup, see [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md) and [docs/chatgpt-connector.md](docs/chatgpt-connector.md).

For a verifiable pre-deployment and pre-merge checklist, see [SECURITY.md](SECURITY.md).

Required controls:

- MCP endpoint must require authentication.
- AWS credentials must be stored only as Cloudflare secrets.
- IAM permissions must be least-privilege and read-only.
- Tools must be explicit and allowlisted.
- Tool inputs must enforce date, region and result-size limits.
- Cost Explorer calls must be cached to reduce cost and avoid repeated paid API calls.
- Logs and errors must never expose secrets, AWS access keys, bearer tokens or raw stack traces.

Forbidden controls:

- Do not commit `.env`, `.dev.vars` or real secrets.
- Do not expose a `run_aws_cli` tool.
- Do not expose a `call_any_aws_api` tool.
- Do not add AWS write permissions in the MVP.

## Initial MCP tools

The MVP should implement these tools first:

```text
get_aws_cost_summary
get_aws_cost_by_service
list_ec2_instances
get_cloudwatch_alarms
get_recent_log_errors
```

See [docs/mcp-tools.md](docs/mcp-tools.md) for the full input and output contract
for each tool, including validation limits, cache behavior, error codes, and
structured content shapes.

Future read-only tools:

```text
get_aws_daily_cost_trend
get_aws_cost_forecast
get_budget_status
list_rds_instances
list_lambda_functions
get_service_inventory
```

Management tools may be added later; see [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md) for required security boundaries.

## Environment variables and secrets

Use `.env.example` for documentation only. Real values must be configured with Wrangler.

### Auth modes

- **Local legacy** (`AUTH_MODE=legacy-bearer`, default): requires `MCP_AUTH_TOKEN` secret. See [docs/mcp-testing.md](docs/mcp-testing.md).
- **ChatGPT OAuth** (`AUTH_MODE=oauth`): requires OAuth vars in `[vars]`; `MCP_AUTH_TOKEN` is not used. See [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md).

### Required secrets (configure with `wrangler secret put`)

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
MCP_AUTH_TOKEN          # legacy-bearer mode only
```

### Required configuration (configure in `wrangler.jsonc` `[vars]`)

```jsonc
{
  "vars": {
    "AWS_REGION": "us-east-1",
    "AWS_ALLOWED_REGIONS": "us-east-1,sa-east-1"
  }
}
```

These are operational configuration, not credentials. They are safe to commit and review.

### Optional KV namespace

Cost Explorer, EC2, CloudWatch, and Logs results are cached in a Cloudflare KV namespace to reduce AWS API calls and cost.

Configure the KV namespace in `wrangler.jsonc`:

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

Create the namespace with Wrangler:

```bash
wrangler kv:namespace create "AWS_MCP_CACHE"
```

Copy the returned `id` into `wrangler.jsonc`.

The cache is optional for local development and tests. If the binding is absent, all tool calls proceed without caching.

**TTLs:** Cost tools use 1800 seconds (30 minutes); EC2 inventory, CloudWatch alarms, and recent log events use 300 seconds (5 minutes).

**Security:** Cache keys are SHA-256 hashes of the tool name and normalized input parameters. Keys and cached values never include AWS credentials, MCP auth tokens, or raw request headers. Only normalized tool output is stored — never raw AWS responses.

### Optional variables

```text
APP_ENV=production
MCP_NAME=aws-mcp-gateway
```

### Configure secrets with Wrangler

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put MCP_AUTH_TOKEN
```

## AWS IAM policy

The gateway requires a least-privilege IAM policy scoped to read-only actions. The canonical policy file is maintained at [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json).

See [`docs/aws-iam-setup.md`](docs/aws-iam-setup.md) for a complete walkthrough covering IAM user creation, policy attachment, access key generation, and credential storage in Cloudflare.

This template is intentionally narrow. Do not use `AdministratorAccess` or broad AWS-managed policies for the gateway.

## Cost controls

The most important cost control is caching tool responses via Cloudflare KV.

Cache TTL:

```text
Cost summary:          30 minutes (1800s)
Cost by service:       30 minutes (1800s)
EC2 inventory:          5 minutes  (300s)
CloudWatch alarms:      5 minutes  (300s)
Recent log events:      5 minutes  (300s)
```

Tool-level limits should reject overly broad requests before calling AWS.

## Local development

Expected commands after scaffolding:

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm dev
```

### Pull requests

PRs are expected to pass `pnpm run typecheck` and `pnpm test` before merge. The CI workflow runs these checks automatically on every pull request and push to `main`.

See [docs/deployment.md](docs/deployment.md) for the full deployment and verification guide.

## Deployment

See [docs/deployment.md](docs/deployment.md) for the full deployment guide, including:

- Prerequisites and local install
- Required secrets and configuration
- Optional KV cache setup
- Deployment command
- Verification steps for `/health` and `/mcp`
- Rollback notes

Quick reference:

```bash
pnpm install
pnpm run typecheck
pnpm test
cp .env.deploy.example .env.deploy.local   # fill AWS_MCP_GATEWAY_* values
pnpm run deploy:configured                 # sync secrets + deploy
```

Or manually:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put MCP_AUTH_TOKEN
pnpm deploy
```

The deployed MCP endpoint will be available at:

```text
https://aws-mcp-gateway.<your-subdomain>.workers.dev/mcp
```

A custom domain can be added later, but it is not required for the MVP.

## ChatGPT connection

The primary use case for this gateway is a **ChatGPT custom app connector** pointing at the deployed HTTPS MCP endpoint:

```text
https://<your-worker-domain>/mcp
```

Use **OAuth** authentication in production (`AUTH_MODE=oauth`). ChatGPT discovers AWS tools through the `search` and `fetch` MCP tools, then calls read-only AWS tools after OAuth.

**Setup and troubleshooting:** [docs/chatgpt-connector.md](docs/chatgpt-connector.md)  
**Auth0 OAuth configuration:** [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md)

See [docs/mcp-testing.md](docs/mcp-testing.md) for smoke tests and expected failure modes.

## Repository safety

This repository is intended to be public-safe.

Safe to commit:

- Source code
- Tool schemas
- Documentation
- Example IAM policy templates
- `.env.example`
- Wrangler configuration without secrets

Never commit:

- AWS access keys
- Cloudflare API tokens
- OAuth client secrets
- Bearer tokens
- `.env`
- `.dev.vars`
- `.wrangler/`

## Roadmap

1. Scaffold the Cloudflare Workers TypeScript project.
2. Add a stateless MCP endpoint.
3. Add authentication.
4. Add AWS signed request client.
5. Implement read-only cost and observability tools.
6. Add KV caching.
7. Add CI, tests and security documentation.
8. Design future management mode without changing the MVP read-only security boundary — see [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md).

## Testing

Unit tests run via Vitest and are **offline by default**.

For manual smoke testing of a deployed gateway, see [docs/mcp-testing.md](docs/mcp-testing.md).

```bash
pnpm test
```

A global fetch guard in `src/test/setup.ts` replaces `globalThis.fetch` with a function that throws on any unmocked network request. This ensures tests are deterministic and never depend on external services.

### Mocking external calls

Use `vi.mock()` to stub modules that make HTTP requests. AWS client tests mock `aws4fetch` at the module level:

```typescript
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    // ...
  },
}));
```

Shared test fixtures (`ceResponse`, `makeDayTotal`, `makeDayWithGroups`) are available in `src/test/fixtures.ts`.

### Test integrity

A passing test suite is required but not sufficient — tests must prove the intended behavior from the issue or spec, not just pass.

- Do not weaken assertions, delete tests, add focused tests (`.only`), or skip failing tests to make the suite pass.
- Skipped tests must include an explicit `intentional-skip:` justification on the same line.
- Security, validation, redaction, authentication, region allowlist, and read-only behavior tests are **contract tests** defining the safety boundary.
- Run `pnpm run test:integrity` to check for focused or unjustified skipped tests.

### Rules

- Every unit test must pass without a network connection.
- Do not remove or bypass the fetch guard in unit tests.
- Integration tests (if added) must live in a separate directory with their own Vitest configuration.

## Commit convention

Use conventional commits:

```text
type(scope): message
```

Examples:

```text
docs(readme): add setup instructions
feat(mcp): add stateless server endpoint
feat(aws): implement cost summary tool
security(auth): require bearer token for mcp endpoint
```
