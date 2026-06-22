# Secure tool platform architecture

## Goal

This document defines the **shipped** manifest-driven architecture for the
read-only AWS MCP gateway. It preserves public MCP and ChatGPT Connector
behavior while making tool discovery, policy checks, AWS capability metadata,
and cost controls explicit and testable.

`/mcp` is authenticated before MCP execution, the server builds a fixed
manifest-backed tool registry, a central policy gate runs before handlers, and
AWS-backed tools return normalized `structuredContent` rather than raw provider
payloads.

## Non-goals

- Do not add broad AWS command execution behavior.
- Do not add an arbitrary AWS API proxy.
- Do not add write or management operations in this architecture phase.
- Do not change current public MCP tool names, current public output contracts,
  or the current ChatGPT Connector discovery model.
- Do not require live AWS calls in default CI or unit tests.
- Do not weaken OAuth, local bearer auth, rate limiting, audit logging,
  repository safety, output guardrails, or existing connector contracts.

## Behavior

### Registered public tools

The registry defines **14** public tools:

```text
search
fetch
get_gateway_status
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

**Default exposure:** 11 tools via packs `core`, `cost`, `inventory`, and
`observability`. The three `aws_*_overview` tools require the opt-in
`aggregates` pack.

Authoritative public behavior:

- `/mcp` is the single MCP endpoint.
- `tools/list` is the source of action discovery for ChatGPT and returns **enabled** tools only.
- `search` and `fetch` remain catalog helpers, not alternate action discovery.
- Disabled or pack-gated tools are omitted from `tools/list` and denied on direct call.
- AWS-backed tools remain explicit, read-only, and bounded.
- `structuredContent` remains the stable machine-readable contract.
- Raw AWS responses are never exposed.

### Request flow

Every manifest-backed tool request follows this flow:

```text
request
  -> auth / rate limit
  -> registry lookup
  -> manifest policy gate
  -> typed handler
  -> AWS client or internal service helper
  -> normalized structuredContent
  -> audit + safe logging
```

Rules for this flow:

- Auth and request throttling still happen before MCP execution.
- Registry lookup remains explicit and allowlisted by tool name.
- Manifest policy runs before AWS work and before expensive downstream work.
- Handlers remain typed, tool-specific, and read-only.
- AWS access remains service-specific rather than generic.
- Outputs remain normalized and documented in
  [`docs/mcp-tools.md`](../mcp-tools.md).
- Audit and production logging remain sanitized and centralized.

### Tool manifest contract

The manifest is the source of truth for:

- MCP registration
- `tools/list` discovery
- ChatGPT catalog/search metadata
- policy evaluation
- AWS capability/IAM documentation
- cost-control enforcement
- contract tests

Required manifest fields:

| Field | Purpose |
|------|---------|
| `name` | Stable public tool name |
| `title` | Human-readable display title |
| `description` | Public tool description |
| `pack` | Tool pack ownership (`core`, `cost`, `inventory`, `observability`, `aggregates`, future `security`) |
| `lifecycle` | Release state such as stable/experimental/internal |
| `inputSchema` | Input validation contract |
| `outputSchema` | Declared `structuredContent` contract where applicable |
| `visibility` | MCP and ChatGPT exposure metadata |
| `auth.requiredScopes` | Required OAuth scopes for execution |
| `aws.services` | Declared AWS services used by the tool |
| `aws.actions` | Declared allowlisted AWS actions used by the tool |
| `aws.capabilities` | Capability IDs aligned with `src/aws/capabilities.ts` |
| `aws.regionMode` | `none`, `global`, `single-region`, or `bounded-multi-region` execution mode |
| `aws.readonly` | Explicit read-only marker |
| `safety.riskLevel` | Current allowed value: `read-only` |
| `safety.cacheTtlSeconds` | Cache TTL metadata |
| `safety.timeoutMs` | Per-tool timeout budget |
| `safety.costClass` | Cost-control classification |
| `costControl` | Explicit cost-control limits (`class`, `requiresCache`, bounds) |
| `catalog` | Search/fetch catalog metadata (non-discovery tools) |
| `audit.sanitizeInput` | Sanitizer used for audit events |
| `descriptorKind` | Descriptor adapter kind |
| `handler` | Typed tool handler implementation |

Manifest expectations:

- Every public tool must be represented by exactly one manifest.
- AWS-backed manifests must declare AWS services, actions, and capabilities explicitly.
- Non-AWS tools may declare empty AWS metadata, but must still declare
  read-only risk, `costControl.class: "free"`, and audit metadata.
- Public descriptor compatibility is preserved by deriving `tools/list` fields from the manifest.

`aws.regionMode` values:

| Value | Use case | Policy behavior |
|-------|----------|-----------------|
| `none` | Non-AWS tools (`search`, `fetch`, `get_gateway_status`) | Skip region validation |
| `global` | AWS account-level APIs (`list_s3_buckets`) | Skip request-region validation; still require AWS metadata and cost-control |
| `single-region` | AWS calls targeting one region | Validate optional `region` / `audit.getRegion` against allowlist |
| `bounded-multi-region` | AWS calls that may fan out over allowed regions | Validate `regions[]` and fanout limits |

### Central policy model

Every manifest-backed tool call passes a central policy gate before handler
execution (`evaluateToolPolicy()` in `src/mcp/tools/policy.ts`).

The policy model evaluates:

- the tool is registered
- the tool is enabled (pack, allowlist, denylist)
- the tool pack is enabled
- the tool lifecycle is allowed for exposure
- the tool risk level is allowed
- required auth scopes are satisfied
- AWS service/action metadata is present for AWS-backed tools
- AWS service/action metadata is allowlisted
- region mode is compatible with the request
- input validation runs before AWS calls
- cost-control constraints are satisfied before expensive work

Default policy behavior:

- default packs expose 11 tools; `aggregates` is opt-in
- only `read-only` risk is allowed
- current AWS services/actions are allowlisted
- current region allowlist enforcement remains in effect
- tools with malformed or missing security metadata fail closed

Policy-denied requests:

- fail before handler-side AWS work
- return normalized safe MCP errors (`validation_error`)
- avoid secrets, tokens, raw headers, stack traces, or raw AWS payloads
- emit sanitized audit metadata for the denied attempt

### Cost-control model

Cost-control requirements are explicit manifest metadata enforced by the policy gate.

Baseline requirements:

- bounded date ranges
- bounded result counts
- cache required for expensive repeated reads
- per-tool timeout budget
- controlled multi-region fanout
- no unbounded discovery operations

Current tool mapping:

| Tool | Cost-control class | Key limits |
|------|-------------------|------------|
| `get_aws_cost_summary` | `paid` | max 90-day date range, cache required |
| `get_aws_cost_by_service` | `paid` | max 90-day range, max 25 services, cache required |
| `list_ec2_instances` | `fanout-sensitive` | bounded allowed-region fanout, cache required |
| `list_lambda_functions` | `fanout-sensitive` | bounded allowed-region fanout, cache required |
| `list_s3_buckets` | `low` | global, cache required |
| `get_cloudwatch_alarms` | `fanout-sensitive` | bounded allowed-region fanout, cache required |
| `get_recent_log_errors` | `volume-sensitive` | bounded lookback (24h), max 50 events, cache required |
| `list_log_groups` | `volume-sensitive` | bounded result count, cache required |
| `aws_account_overview` | `fanout-sensitive` | composes inventory APIs, bounded samples |
| `aws_cost_overview` | `paid` | composes cost APIs, bounded date range |
| `aws_observability_overview` | `fanout-sensitive` | composes observability APIs, bounded samples |
| `search` / `fetch` / `get_gateway_status` | `free` | no AWS cost, no AWS fanout |

Cost-control policy rules:

- paid or expensive repeated reads require cache metadata
- region fanout must stay within configured allowed regions
- result count limits must be explicit rather than inferred
- date-range limits must be explicit for time-bounded tools
- missing cost-control metadata on AWS-backed tools fails closed

### Expansion rules

All future tool expansion must follow these rules:

1. New tools must be added through manifests, not ad hoc registry entries.
2. New AWS-backed tools must declare service/action/capability metadata explicitly.
3. New AWS-backed read-only tools must update IAM docs or the generated
   capability matrix before merge.
4. New tools must include descriptor, policy, validation, output, and error
   coverage.
5. New tools must stay explicit and bounded; they must not introduce generic
   AWS execution patterns.
6. New tools must define cost-control metadata appropriate to their AWS API
   shape.
7. New tools must preserve normalized outputs and must not expose raw provider
   responses.

## Security and safety

The secure tool platform keeps the defense-in-depth model explicit:

- Authentication gates `/mcp` before any MCP or AWS execution.
- The registry remains explicit and allowlisted.
- The policy gate fails closed on missing or malformed metadata.
- AWS access remains read-only and service-specific.
- Region execution remains bounded by configured allowlists.
- Cost-sensitive tools require explicit limits and cache metadata.
- Audit logging uses sanitized inputs and centralized sinks.
- Public errors remain normalized and safe.

The architecture is intentionally incompatible with:

- generic `run_aws_cli` tools
- generic `call_any_aws_api` tools
- write-capable or management-capable AWS operations
- raw AWS response passthrough
- tests or CI that depend on live AWS credentials or network calls

## Acceptance criteria

- Manifest-backed registry with 14 public tools and pack-based exposure.
- Central policy gate runs before handler execution and fails closed.
- Cost-control metadata covers all registered tools.
- Capability matrix covers all AWS-backed tools.
- `tools/list` returns enabled tools only; disabled tools are not listed.
- ChatGPT Connector discovery and descriptor contracts remain stable.
- No broad AWS execution, arbitrary AWS proxying, or write/management behavior.

## Test plan

Automated contract verification:

```bash
pnpm run repo:safety
pnpm run output:guardrail
pnpm run verify:connector-contract
```

Key contract tests:

- `src/mcp/tools/manifest-contract.test.ts`
- `src/mcp/tools/policy.test.ts`
- `src/mcp/tools/cost-control-policy.test.ts`
- `src/mcp/tools/capability-contract.test.ts`
- `src/mcp/tools/capability-matrix.test.ts`
- `src/mcp/tools/exposure.test.ts`
- `src/mcp/tools/descriptor-contract.test.ts`
- `src/mcp/tools/list-integration.test.ts`

Production acceptance: [chatgpt-connector-production-acceptance.md](../chatgpt-connector-production-acceptance.md).
