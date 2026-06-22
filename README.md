# AWS MCP Gateway

AWS MCP Gateway is a security-focused [Model Context Protocol](https://modelcontextprotocol.io/) server that lets ChatGPT read selected AWS account data through explicit, read-only tools.

It runs as a Cloudflare Worker, authenticates requests, validates every tool input, signs allowed AWS API calls, and returns normalized results without exposing generic AWS API access.

## What is this?

This project is a self-hosted MCP gateway for connecting ChatGPT to AWS account data in a controlled way.

Instead of giving ChatGPT broad AWS credentials, shell access, or a generic AWS API proxy, the gateway exposes a small set of audited MCP tools. Each tool has a fixed purpose, validated input, bounded output, and read-only AWS permissions.

```text
ChatGPT Connector
  -> OAuth / bearer authentication
  -> Cloudflare Worker /mcp endpoint
  -> Explicit MCP tools
  -> Signed read-only AWS API requests
  -> Normalized AWS cost, inventory, alarm, and log data
```

## Current status

The gateway is currently designed for:

- remote MCP usage over HTTPS;
- ChatGPT custom app connector integration;
- OAuth-based ChatGPT connector authentication;
- local legacy bearer-token development;
- read-only AWS cost, EC2, CloudWatch, and CloudWatch Logs inspection.

Production deployments should still run the verification and acceptance checks documented in [`docs/chatgpt-connector-production-acceptance.md`](docs/chatgpt-connector-production-acceptance.md).

## Features

- Remote MCP endpoint at `/mcp`.
- ChatGPT-compatible OAuth connector flow.
- Explicit read-only AWS tools only.
- No generic AWS CLI or arbitrary AWS API proxy.
- Least-privilege IAM policy template.
- Region allowlist and input validation.
- Cloudflare KV caching for AWS-backed tool responses.
- OAuth request rate limiting with a Durable Object.
- Offline unit tests with a fetch guard against accidental network calls.
- Contract checks for MCP tool discovery and ChatGPT connector compatibility.

## Available MCP tools

| Tool | Purpose | Calls AWS |
| --- | --- | --- |
| `search` | Catalog search helper for ChatGPT discovery | No |
| `fetch` | Catalog document helper for tool details | No* |
| `get_gateway_status` | Verify the gateway is reachable and authenticated | No |
| `get_aws_cost_summary` | Return total AWS cost for a bounded date range | Yes |
| `get_aws_cost_by_service` | Return AWS cost grouped by service | Yes |
| `list_ec2_instances` | List EC2 instances in allowed regions | Yes |
| `get_cloudwatch_alarms` | Return CloudWatch alarm states | Yes |
| `get_recent_log_errors` | Return recent CloudWatch Logs errors/warnings | Yes |

\* `fetch` does not call AWS except when embedding live `get_gateway_status` JSON for that catalog entry.

Full tool contracts are documented in [`docs/mcp-tools.md`](docs/mcp-tools.md).

## When to use it

Use this gateway when you want ChatGPT to answer questions such as:

- “How much did my AWS account spend this month?”
- “Which services are driving my AWS bill?”
- “What EC2 instances are running in my allowed regions?”
- “Are there any CloudWatch alarms in ALARM state?”
- “Show me recent error or warning log events.”

The project is useful for personal AWS account inspection, lightweight cloud operations, cost visibility, and controlled ChatGPT-based observability workflows.

## When not to use it

Do not use this project as-is if you need:

- AWS write or management operations;
- provisioning, remediation, or infrastructure mutation;
- arbitrary AWS API access;
- a generic AWS CLI over MCP;
- multi-tenant SaaS isolation;
- a dashboard, database, or long-running backend service.

Management tools may be added later only behind stricter security boundaries. See [`docs/post-mvp-boundaries.md`](docs/post-mvp-boundaries.md).

## Requirements

- Node.js `>=22`
- `pnpm` `11.8.0`
- Cloudflare account with Workers enabled
- AWS account with a dedicated read-only IAM user
- Wrangler authentication or a scoped Cloudflare API token
- Auth0 or another OIDC-compatible provider for production ChatGPT OAuth setup

## Quick start: local development

Install dependencies:

```bash
pnpm install
```

Create local runtime secrets:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill:

```text
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_ALLOWED_REGIONS=us-east-1,sa-east-1
AUTH_MODE=legacy-bearer
MCP_AUTH_TOKEN=
```

Run validation:

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

Start the local Worker:

```bash
pnpm dev
```

The local MCP endpoint is available at:

```text
http://localhost:8787/mcp
```

Local development uses `AUTH_MODE=legacy-bearer` by default. Production ChatGPT connector deployments should use OAuth.

## Configuration

Copy the example Wrangler config:

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

Update at least:

- `AWS_REGION`
- `AWS_ALLOWED_REGIONS`
- `AUTH_MODE`
- `MCP_RESOURCE_URL`
- `OAUTH_ISSUER`
- `OAUTH_AUDIENCE`
- `OAUTH_JWKS_URI`
- `OAUTH_REQUIRED_SCOPES`
- `kv_namespaces[].id`

Important URL model:

```text
ChatGPT Connector Server URL: https://<worker-host>/mcp
MCP_RESOURCE_URL:              https://<worker-host>
OAUTH_AUDIENCE:                https://<worker-host>
OAuth protected metadata:      https://<worker-host>/.well-known/oauth-protected-resource
```

`MCP_RESOURCE_URL` and `OAUTH_AUDIENCE` must use the Worker origin only. Do not append `/mcp` to those values.

## AWS IAM setup

Use a dedicated IAM user with only the permissions required by the gateway.

The canonical read-only policy is maintained at [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json).

See [`docs/aws-iam-setup.md`](docs/aws-iam-setup.md) for the complete IAM setup flow.

Do not use `AdministratorAccess` or broad AWS-managed policies for this gateway.

## Optional KV cache

Cloudflare KV can cache normalized AWS tool responses to reduce repeated AWS API calls and Cost Explorer usage.

Create the namespace:

```bash
wrangler kv:namespace create "AWS_MCP_CACHE"
```

Then copy the returned namespace id into `wrangler.jsonc`.

Default cache TTLs:

| Data | TTL |
| --- | --- |
| AWS cost summary | 30 minutes |
| AWS cost by service | 30 minutes |
| EC2 inventory | 5 minutes |
| CloudWatch alarms | 5 minutes |
| Recent log events | 5 minutes |

The cache is optional for local development and tests. If the binding is absent, tools run without caching.

## Deploy to Cloudflare Workers

Prepare deploy-time credentials:

```bash
cp .env.deploy.example .env.deploy.local
```

Fill the required values in `.env.deploy.local`, then deploy:

```bash
pnpm run deploy:configured
```

Or deploy manually after configuring Worker secrets with Wrangler:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put MCP_AUTH_TOKEN # legacy-bearer mode only
pnpm deploy
```

For OAuth production mode, configure OAuth values in `wrangler.jsonc` `[vars]` and use Worker secrets only for credentials and private client secrets.

See [`docs/deployment.md`](docs/deployment.md) for the full deployment guide.

## Connect to ChatGPT

This gateway is designed for a ChatGPT custom app connector.

In ChatGPT connector setup, use:

```text
Server URL: https://<worker-host>/mcp
Authentication: OAuth
Scope: aws:read
```

The Worker OAuth resource and audience must be the origin only:

```text
https://<worker-host>
```

After deploying, configure deployment targets (`AWS_MCP_GATEWAY_WORKER_URL`, `AWS_MCP_GATEWAY_AUTH0_DOMAIN` in `.env.deploy.local` or as script arguments), then run:

```bash
pnpm run verify:connector-contract
source .env.deploy.local && pnpm run verify:oauth
pnpm run verify:oauth:authenticated
```

Then create or refresh the ChatGPT connector. The Actions list should expose all 8 public MCP tools.

Detailed setup and troubleshooting:

- [`docs/chatgpt-connector.md`](docs/chatgpt-connector.md)
- [`docs/auth-chatgpt-oauth.md`](docs/auth-chatgpt-oauth.md)
- [`docs/chatgpt-connector-smoke-test.md`](docs/chatgpt-connector-smoke-test.md)
- [`docs/chatgpt-connector-production-acceptance.md`](docs/chatgpt-connector-production-acceptance.md)

## Security model

The gateway is intentionally read-only.

Required controls:

- MCP requests must be authenticated.
- AWS credentials must be stored outside Git as Cloudflare secrets.
- IAM permissions must be least-privilege and read-only.
- Tools must be explicit and allowlisted.
- Tool inputs must enforce date, region, and result-size limits.
- AWS responses must be normalized before returning to the client.
- Logs and errors must not expose secrets, AWS access keys, bearer tokens, OAuth tokens, or raw stack traces.

Forbidden in the current scope:

- no `run_aws_cli` tool;
- no `call_any_aws_api` tool;
- no AWS write permissions;
- no committed `.env`, `.dev.vars`, `.env.deploy.local`, `.wrangler/`, or real credentials.

For the full security checklist, see [`SECURITY.md`](SECURITY.md).

## Testing

Run the standard local checks:

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

Tests are offline by default. A global fetch guard fails any unmocked network request during unit tests.

When changing MCP descriptors, OAuth behavior, or connector discovery, also run:

```bash
pnpm run verify:connector-contract
```

Runtime MCP/auth dependency upgrades must be treated as protocol changes. See [`docs/dependency-upgrade-contract.md`](docs/dependency-upgrade-contract.md).

## Documentation

| Document | Purpose |
| --- | --- |
| [`docs/mcp-tools.md`](docs/mcp-tools.md) | Public MCP tool contracts |
| [`docs/chatgpt-connector.md`](docs/chatgpt-connector.md) | ChatGPT connector integration guide |
| [`docs/auth-chatgpt-oauth.md`](docs/auth-chatgpt-oauth.md) | OAuth/Auth0 setup |
| [`docs/deployment.md`](docs/deployment.md) | Cloudflare deployment guide |
| [`docs/aws-iam-setup.md`](docs/aws-iam-setup.md) | AWS IAM setup |
| [`docs/mcp-testing.md`](docs/mcp-testing.md) | Manual MCP smoke tests |
| [`SECURITY.md`](SECURITY.md) | Security checklist and public-safe repository rules |

## Repository safety

Safe to commit:

- source code;
- tests;
- documentation;
- tool schemas;
- example IAM policies;
- example environment files;
- Wrangler configuration without secrets.

Never commit:

- AWS access keys;
- Cloudflare API tokens;
- OAuth client secrets;
- bearer tokens;
- `.env`;
- `.dev.vars`;
- `.env.deploy.local`;
- `.wrangler/`.

## Contributing

Before opening a pull request, run:

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

Use conventional commits:

```text
type(scope): message
```

Examples:

```text
docs(readme): improve setup guide
feat(mcp): add read-only budget status tool
fix(auth): reject tokens without required scope
security(aws): tighten IAM policy actions
```

Pull requests that change public tool behavior should update [`docs/mcp-tools.md`](docs/mcp-tools.md) and include focused contract tests.

## License

MIT. See [`LICENSE`](LICENSE).

## Disclaimer

This project is not affiliated with AWS, Cloudflare, OpenAI, or Auth0. Use it with dedicated credentials, least-privilege IAM permissions, and your own security review before production use.
