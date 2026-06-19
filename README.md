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

The MVP must remain read-only.

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

Future read-only tools:

```text
get_aws_daily_cost_trend
get_aws_cost_forecast
get_budget_status
list_rds_instances
list_lambda_functions
get_service_inventory
```

Management tools may be added later, but they must use a separate security model, separate IAM permissions and explicit confirmation requirements.

## Environment variables and secrets

Use `.env.example` for documentation only. Real values must be configured with Wrangler.

### Required secrets (configure with `wrangler secret put`)

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
MCP_AUTH_TOKEN
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

The initial IAM policy should be scoped to read-only APIs required by the first tools.

Example actions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CostRead",
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage",
        "ce:GetCostForecast",
        "budgets:ViewBudget"
      ],
      "Resource": "*"
    },
    {
      "Sid": "InfraObservabilityRead",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:GetMetricData",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:FilterLogEvents",
        "tag:GetResources"
      ],
      "Resource": "*"
    }
  ]
}
```

This template is intentionally narrow. Do not use `AdministratorAccess` or broad AWS-managed policies for the gateway.

## Cost controls

The most important cost control is caching Cost Explorer responses.

Recommended cache TTLs:

```text
Cost summary: 30-60 minutes
Cost by service: 30-60 minutes
EC2 inventory: 1-5 minutes
CloudWatch alarms: 1-5 minutes
Recent log errors: 1-5 minutes
```

Tool-level limits should reject overly broad requests before calling AWS.

## Local development

Expected commands after scaffolding:

```bash
npm install
npm run typecheck
npm run test
wrangler dev
```

## Deployment

Expected deployment flow:

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put MCP_AUTH_TOKEN
wrangler deploy
```

The deployed MCP endpoint should look like:

```text
https://aws-mcp-gateway.<account>.workers.dev/mcp
```

A custom domain can be added later, but it is not required for the MVP.

## ChatGPT connection

The ChatGPT connector should point to the deployed HTTPS MCP endpoint:

```text
https://<your-worker-domain>/mcp
```

The connector must authenticate before calling AWS-backed tools.

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
8. Design future management mode without changing the MVP read-only security boundary.

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
