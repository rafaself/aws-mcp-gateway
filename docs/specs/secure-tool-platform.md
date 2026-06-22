# Secure tool platform architecture

## Goal

This document defines the target architecture for evolving the current explicit,
read-only AWS MCP gateway into a manifest-driven tool platform. It preserves the
current public MCP and ChatGPT Connector behavior while making tool discovery,
policy checks, AWS capability metadata, and cost controls explicit and
testable.

The current implementation already has the correct top-level shape: `/mcp` is
authenticated before MCP execution, the server builds a fixed tool registry, and
AWS-backed tools return normalized `structuredContent` rather than raw provider
payloads. This spec defines how that same read-only contract scales safely.

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

### Current public surface that must remain stable

The current public tools are:

```text
search
fetch
get_gateway_status
get_aws_cost_summary
get_aws_cost_by_service
list_ec2_instances
get_cloudwatch_alarms
get_recent_log_errors
```

Current public behavior that remains authoritative:

- `/mcp` is the single MCP endpoint.
- `tools/list` is the source of action discovery for ChatGPT.
- `search` and `fetch` remain catalog helpers, not alternate action discovery.
- AWS-backed tools remain explicit, read-only, and bounded.
- `structuredContent` remains the stable machine-readable contract.
- Raw AWS responses are never exposed.

### Target request flow

Every manifest-backed tool request should follow this flow:

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

The registry should evolve from a minimal tool definition into a richer
manifest contract that becomes the source of truth for:

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
| `pack` | Tool pack ownership (`core`, `cost`, `inventory`, `observability`, future `security`) |
| `lifecycle` | Release state such as stable/experimental/internal |
| `inputSchema` | Input validation contract |
| `outputSchema` | Declared `structuredContent` contract where applicable |
| `visibility` | MCP and ChatGPT exposure metadata |
| `auth.requiredScopes` | Required OAuth scopes for execution |
| `aws.services` | Declared AWS services used by the tool |
| `aws.actions` | Declared allowlisted AWS actions used by the tool |
| `aws.regionMode` | Global, single-region, or bounded multi-region execution mode |
| `aws.readonly` | Explicit read-only marker |
| `safety.riskLevel` | Current allowed value: `read-only` |
| `safety.cacheTtlSeconds` | Cache TTL metadata |
| `safety.timeoutMs` | Per-tool timeout budget |
| `safety.costClass` | Cost-control classification |
| `catalog` | Search/fetch catalog metadata |
| `audit.sanitizeInput` | Sanitizer used for audit events |
| `handler` | Typed tool handler implementation |

Manifest expectations:

- Every public tool must be represented by exactly one manifest.
- AWS-backed manifests must declare AWS services and actions explicitly.
- Non-AWS tools may declare empty AWS metadata, but must still declare
  read-only risk and audit metadata.
- Public descriptor compatibility is preserved by deriving the current
  `tools/list` fields from the manifest rather than changing the external shape.

### Central policy model

Every manifest-backed tool call must pass a central policy gate before handler
execution.

The policy model should evaluate:

- the tool is registered
- the tool is enabled
- the tool pack is enabled
- the tool lifecycle is allowed for exposure
- the tool risk level is allowed
- required auth scopes are satisfied
- AWS service/action metadata is present for AWS-backed tools
- AWS service/action metadata is allowlisted
- region mode is compatible with the request
- input validation runs before AWS calls
- cost-control constraints are satisfied before expensive work

Default policy behavior for the current repository:

- all current public tools are enabled
- only `read-only` risk is allowed
- current AWS services/actions are allowlisted
- current region allowlist enforcement remains in effect
- tools with malformed or missing security metadata fail closed

Policy-denied requests should:

- fail before handler-side AWS work
- return normalized safe MCP errors
- use a safe public code such as `validation_error`
- avoid secrets, tokens, raw headers, stack traces, or raw AWS payloads
- emit sanitized audit metadata for the denied attempt

### Cost-control model

Cost-control requirements move from implicit per-tool implementation details to
explicit manifest metadata and policy checks.

Baseline requirements:

- bounded date ranges
- bounded result counts
- cache required for expensive repeated reads
- per-tool timeout budget
- controlled multi-region fanout
- no unbounded discovery operations

Current tool mapping that future manifest metadata must preserve:

| Tool | Cost-control requirements |
|------|---------------------------|
| `get_aws_cost_summary` | max 90-day date range, cached, bounded timeout |
| `get_aws_cost_by_service` | max 90-day date range, max 25 services, cached, bounded timeout |
| `list_ec2_instances` | bounded allowed-region fanout, cached, bounded timeout |
| `get_cloudwatch_alarms` | bounded allowed-region fanout, cached, bounded timeout |
| `get_recent_log_errors` | bounded lookback, bounded event count, cached, bounded timeout |
| `search` / `fetch` / `get_gateway_status` | no AWS cost, no AWS fanout, still explicit timeout metadata |

Cost-control policy rules:

- paid or expensive repeated reads require cache metadata
- region fanout must stay within configured allowed regions
- result count limits must be explicit rather than inferred
- date-range limits must be explicit for time-bounded tools
- missing cost-control metadata on AWS-backed tools fails closed

### Expansion rules

All future tool expansion must follow these rules:

1. New tools must be added through manifests, not ad hoc registry entries.
2. New AWS-backed tools must declare service/action metadata explicitly.
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

The secure tool platform keeps the current defense-in-depth model and makes it
more explicit:

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

- `docs/specs/secure-tool-platform.md` exists as the architecture contract for
  the manifest-driven tool platform.
- The spec defines the target request flow from auth/rate limit through
  normalized output and audit logging.
- The spec defines the required manifest contract and its mandatory metadata.
- The spec defines the central policy gate model and its fail-closed behavior.
- The spec defines cost-control requirements for current and future AWS-backed
  tools.
- The spec defines expansion rules for adding new tools safely.
- The spec preserves the current read-only public MCP and ChatGPT Connector
  contract.
- The spec does not introduce broad AWS execution, arbitrary AWS proxying, or
  write/management behavior.

## Test plan

Documentation-only verification for this issue:

- add the spec file
- link it from [`docs/specs/README.md`](README.md)
- verify the spec is consistent with current MCP/public-tool behavior described
  in [`docs/mcp-tools.md`](../mcp-tools.md)
- run:
  - `pnpm run repo:safety`
  - `pnpm run output:guardrail`
  - `pnpm run verify:connector-contract`

Implementation follow-up issues should add the automated runtime and contract
tests described in sprint issue `#112` and child issues `#114` through `#122`.
