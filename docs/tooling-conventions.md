# MCP tool conventions

Every MCP tool in this repository must follow the conventions below to keep the gateway predictable, testable and consistent.

The AWS-backed tool names below are the core inventory tools. `search`, `fetch`, and `get_gateway_status` follow the same validation and output rules but are documented in [mcp-tools.md](mcp-tools.md).

## Tool naming

- Use `snake_case`.
- Use action-oriented names that describe what the tool does.
- Use specific business tools instead of broad executor tools.

Supported AWS tool names:

```text
get_aws_cost_summary
get_aws_cost_by_service
list_ec2_instances
get_cloudwatch_alarms
get_recent_log_errors
```

## Input validation

- Use Zod schemas for every tool input.
- Validate date ranges before calling AWS — reject invalid or incomplete periods early.
- Validate region values against the `AWS_ALLOWED_REGIONS` allowlist.
- Apply explicit result limits to prevent overly broad queries.
- Use `z.enum()` for constrained parameters (e.g. time granularity, alarm state).

## Output format

Every AWS tool must return a response with two fields:

- **`content`** — A short human-readable summary of the result (e.g. "Found 12 EC2 instances across 2 regions").
- **`structuredContent`** — Normalized machine-readable data (e.g. an array of instance objects with consistent field names).

## Date handling

- All dates must use `YYYY-MM-DD` format.
- Cost tools must only accept completed or current billing periods. Future dates must be rejected.
- Cost tools must enforce a maximum range of 90 days per request in the current read-only scope.
- Observability tools (alarms, logs) may use broader ranges but must have explicit limits.

## Region handling

- Resource-scoped tools must validate regions against the `AWS_ALLOWED_REGIONS` environment variable.
- A caller may request a subset of the configured allowed regions.
- A caller may not specify regions outside the configured allowlist — those requests must be rejected.
- If no region is specified, the tool should use the full allowlist.
