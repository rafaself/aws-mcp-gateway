# MCP testing

This guide describes how to verify that the deployed MCP gateway is working correctly using manual smoke tests. It covers authentication, endpoint structure, the MVP tool allowlist, and expected failure behavior.

## Authentication model

The MCP endpoint requires a bearer token for every request. The token is configured as the `MCP_AUTH_TOKEN` Cloudflare secret at deploy time (see [deployment guide](deployment.md)).

- **Health check** (`GET /health`) — no authentication required.
- **MCP endpoint** (`POST /mcp`) — requires `Authorization: Bearer <token>` header. Requests without a valid token receive a 401 response.

## Endpoint

```text
https://<worker-host>/mcp
```

Replace `<worker-host>` with the URL output by `pnpm deploy`, e.g. `https://aws-mcp-gateway.<your-subdomain>.workers.dev`.

## Tool allowlist (MVP)

The gateway exposes the following tools. See [docs/mcp-tools.md](mcp-tools.md) for the full input and output contracts.

| Tool | Purpose | Requires AWS call |
|------|---------|-------------------|
| `get_gateway_status` | Return gateway service status | No |
| `get_aws_cost_summary` | Total AWS cost for a date range | Yes (Cost Explorer) |
| `get_aws_cost_by_service` | AWS cost broken down by service | Yes (Cost Explorer) |
| `list_ec2_instances` | EC2 instances across regions | Yes (EC2) |
| `get_cloudwatch_alarms` | CloudWatch alarms across regions | Yes (CloudWatch) |
| `get_recent_log_errors` | Recent error/warn log events | Yes (CloudWatch Logs) |

## Smoke test sequence

Run these checks after a fresh deployment to confirm the gateway is working correctly.

### 1. Health check

```bash
curl https://<worker-host>/health
```

Expected: `200` with `{ "ok": true, "service": "aws-mcp-gateway" }`.

### 2. Unauthenticated MCP rejection

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: `401` with error code `"unauthorized"`.

Also verify that an invalid token is rejected:

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer invalid" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: `401` with error code `"unauthorized"`.

### 3. Authenticated MCP connection

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <your-mcp-auth-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: `200` with a `result.tools` array containing all 6 registered tools.

### 4. Low-risk status tool

This tool makes no AWS calls and has no side effects.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_gateway_status","arguments":{}}}'
```

Expected: Returns `{ service: "aws-mcp-gateway", status: "ok", mode: "read-only" }`.

### 5. Cost tool (one)

Verify a Cost Explorer tool with a bounded date range.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_aws_cost_summary","arguments":{"startDate":"2026-01-01","endDate":"2026-01-31","granularity":"MONTHLY"}}}'
```

Expected: Returns cost data with total and currency, or an `aws_request_failed` error if the IAM credentials lack Cost Explorer permissions.

### 6. Regional inventory or observability tool (one allowed region)

Verify a regional tool against an allowed region.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_ec2_instances","arguments":{"regions":["us-east-1"],"states":["running"]}}}'
```

Expected: Returns EC2 instances (possibly empty) in `us-east-1`, or an `aws_request_failed` error if the IAM credentials lack EC2 `DescribeInstances` permission.

## Expected failure behavior

These checks confirm that validation and security controls are working as expected.

### Invalid region

Target a region not in the `AWS_ALLOWED_REGIONS` allowlist.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"list_ec2_instances","arguments":{"regions":["eu-west-1"]}}}'
```

Expected: Error with code `"validation_error"`. No AWS call is made.

### Invalid date range

Submit a date range that exceeds the 90-day maximum.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_aws_cost_summary","arguments":{"startDate":"2025-01-01","endDate":"2026-06-01","granularity":"MONTHLY"}}}'
```

Expected: Error with code `"validation_error"`. No AWS call is made.

Also verify a future date is rejected:

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_aws_cost_summary","arguments":{"startDate":"2026-01-01","endDate":"2099-12-31","granularity":"MONTHLY"}}}'
```

Expected: Error with code `"validation_error"`.

### Missing authentication

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_gateway_status","arguments":{}}}'
```

Expected: `401` with error code `"unauthorized"`. No tool is executed.

## Notes

- Smoke checks must not require broad AWS permissions. The IAM policy at [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json) defines the exact permissions the gateway needs — test against that scope.
- Cost Explorer tools make live AWS API calls that may incur charges. Use tight date ranges and run sparingly during manual testing.
- Regional tools (EC2, CloudWatch, Logs) also make live AWS calls. Verify allowed regions are configured before testing regional tools.
- Cached responses serve subsequent identical requests within the TTL window without calling AWS.
