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
list_lambda_functions
list_s3_buckets
list_log_groups
aws_account_overview
aws_cost_overview
aws_observability_overview
```

Aggregate overview tools (`aws_*_overview`) live in the `aggregates` pack and are disabled by default. They compose existing AWS clients and return bounded counts plus short samples — not full account crawls. Enable the pack explicitly when needed.

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

## AWS capability metadata

New AWS-backed tools must:

- declare capability IDs from `src/aws/capabilities.ts` on the tool manifest;
- keep manifest `aws.actions` aligned with those capabilities;
- register a new capability entry when introducing a new AWS action;
- update [`docs/aws-capability-matrix.md`](aws-capability-matrix.md) before merge.

The capability contract tests in `src/mcp/tools/capability-contract.test.ts` fail when capability metadata is missing or unknown.

## Cost-control metadata

Every manifest-backed tool must declare `costControl` metadata on the tool manifest. The policy gate enforces these limits before handler execution.

Non-AWS tools use the safe default:

```ts
costControl: {
  class: "free",
  requiresCache: false,
  timeoutMs: 5000,
}
```

AWS-backed tools must declare a class appropriate to their API shape (`paid`, `fanout-sensitive`, `volume-sensitive`, or `low`), set `requiresCache: true` when reads are expensive or repeated, and declare explicit bounds such as `maxDateRangeDays`, `maxResultCount`, `maxRegions`, or `maxLookbackHours` where applicable.

Example for a paid cost tool:

```ts
costControl: {
  class: "paid",
  requiresCache: true,
  timeoutMs: 15000,
  maxDateRangeDays: COST_MAX_DATE_RANGE_DAYS,
  minCacheTtlSeconds: 1800,
}
```

Contract tests in `src/mcp/tools/manifest-contract.test.ts` and `src/mcp/tools/cost-control-policy.test.ts` fail when AWS-backed tools are missing cost-control metadata or when limits drift from `src/security/limits.ts`.

## Adding a manifest-backed tool

Follow this workflow when introducing a new public MCP tool:

1. **Definition and handler** — Add `src/mcp/tools/definitions/<tool-name>.ts` with Zod input schema, normalized output, and handler logic.
2. **Manifest registration** — Register a manifest factory in `src/mcp/tools/registry.ts` with `pack`, `lifecycle`, `descriptorKind`, `visibility`, `auth`, `aws`, `safety`, `costControl`, `audit`, and `catalog` metadata (for non-discovery tools).
3. **Capability metadata** — Declare `aws.capabilities` from `src/aws/capabilities.ts`; add a new capability entry if introducing a new AWS action.
4. **Capability matrix** — Update [`docs/aws-capability-matrix.md`](aws-capability-matrix.md) before merge.
5. **IAM policy** — Extend [`infra/aws/iam-readonly-policy.json`](../infra/aws/iam-readonly-policy.json) only when a new AWS action is required; keep it aligned with the capability registry (`src/aws/iam-readonly-policy.test.ts` must pass).
6. **Documentation** — Add the tool contract to [`docs/mcp-tools.md`](mcp-tools.md).
7. **Tests** — Add or extend contract tests as applicable:
   - `src/mcp/tools/manifest-contract.test.ts`
   - `src/mcp/tools/policy.test.ts`
   - `src/mcp/tools/cost-control-policy.test.ts`
   - `src/mcp/tools/capability-contract.test.ts`
   - `src/aws/iam-readonly-policy.test.ts`
   - `src/mcp/tools/descriptor-contract.test.ts`
   - `src/mcp/tools/exposure.test.ts`

8. **Validation** — Run the full pre-PR validation block from [README.md](../README.md#testing) before opening a pull request.

Assign the tool to an existing pack or a new pack in `src/config/tool-exposure.ts`. Opt-in packs require explicit enablement via `AWS_MCP_ENABLED_TOOL_PACKS`.

See also [`docs/specs/secure-tool-platform.md`](specs/secure-tool-platform.md) for the platform architecture contract.
