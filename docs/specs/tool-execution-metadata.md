# Tool execution metadata contract

## Goal

Define a stable, additive public contract for execution metadata on AWS-backed MCP tool results. Callers can learn whether a response was served from cache, how many AWS API requests were made, and whether an estimated provider cost may apply — without changing existing normalized domain fields in `structuredContent`.

This spec covers types, schemas, manifest-backed builders, and a central attach helper. Live cache instrumentation, AWS request counting, and visible billing notes in `content` are deferred to follow-up issues.

## Non-goals

- Do not change AWS IAM permissions.
- Do not add write or management tools.
- Do not expose cache keys, KV internals, raw AWS responses, credentials, bearer tokens, OAuth tokens, or stack traces.
- Do not estimate exact billing for services without a reliable fixed per-request price.
- Do not add visible user-facing billing text in `content` in this phase.
- Do not instrument cache hit/miss or AWS request counts in handlers yet.
- Do not rewrite existing tool handlers in this phase.

## Behavior

### Before

AWS-backed tools return normalized domain data in `structuredContent` (for example `period`, `total`, `instances`). Callers cannot reliably tell whether the response came from cache, how many AWS API requests were made, or whether an estimated AWS API cost applies.

### After

AWS-backed tool results **can** include a standardized execution metadata object at `structuredContent.execution` while preserving existing domain fields at their current top-level locations.

Example shape:

```json
{
  "period": { "startDate": "2026-06-01", "endDate": "2026-06-23" },
  "total": 12.34,
  "currency": "USD",
  "execution": {
    "cache": { "enabled": true, "status": "miss", "ttlSeconds": 1800 },
    "billing": {
      "provider": "aws",
      "costClass": "paid",
      "estimatedCostUsd": 0.01,
      "currency": "USD",
      "charged": true,
      "pricingModel": "per-request",
      "note": "Estimated AWS Cost Explorer API charge for a non-cached request. Final billing is determined by AWS."
    },
    "awsRequests": [
      {
        "service": "ce",
        "action": "ce:GetCostAndUsage",
        "region": "us-east-1",
        "requestCount": 1,
        "estimatedUnitCostUsd": 0.01
      }
    ],
    "awsRequestCount": 1
  }
}
```

### Type contract

Implementation lives in `src/mcp/execution/`:

| Field | Allowed values |
|-------|----------------|
| `cache.status` | `hit`, `miss`, `disabled`, `unavailable`, `bypass` |
| `billing.costClass` | `free`, `low`, `paid`, `fanout-sensitive`, `volume-sensitive` |
| `billing.pricingModel` | `none`, `per-request`, `per-1000-requests`, `usage-dependent` |

`billing.estimatedCostUsd` is an **estimate** only. Final AWS billing is determined by AWS account usage and pricing; this field is not a source of truth for invoices.

### Foundation defaults

When handlers have not yet supplied runtime facts:

- `cache.status` is `unavailable` when caching is enabled on the manifest, or `disabled` when it is not.
- `awsRequests` lists manifest capabilities with `requestCount: 0`.
- `awsRequestCount` is `0`.
- `billing.charged` is `false`.
- `billing.estimatedCostUsd` is `0`.

### Non-AWS tools

Core tools (`search`, `fetch`, `get_gateway_status`) are not forced into AWS billing metadata. The builder rejects non-AWS manifests.

### Validation

- Metadata is validated with Zod schemas before attach.
- Unknown `cache.status`, `costClass`, or `pricingModel` values are rejected.
- Metadata construction fails closed when required fields are missing for AWS-backed tools.

## Security and safety

- Never expose cache keys, raw request bodies, raw AWS responses, credentials, bearer tokens, OAuth tokens, or internal stack traces.
- Metadata describes only normalized execution facts: cache status, safe service/action names, safe region names, request counts, and estimated cost class.
- Billing values are explicitly labeled as estimates in `billing.note`.
- The gateway remains read-only.

## Acceptance criteria

- [x] Reusable `ToolExecutionMetadata` type and Zod schema exist (`src/mcp/execution/metadata.ts`).
- [x] Central helpers exist to build metadata from manifests and attach it to `structuredContent` (`src/mcp/execution/build.ts`, `src/mcp/execution/attach.ts`).
- [x] Existing structured domain fields remain backward-compatible and additive (covered by attach tests).
- [x] AWS-backed metadata supports cache status, billing estimate, AWS request count, and safe AWS action summaries.
- [x] Non-AWS public tools are not forced into misleading AWS billing metadata.
- [x] Tests cover valid and invalid metadata shapes.
- [x] This spec documents the contract and safety constraints.

## Test plan

- `src/mcp/execution/metadata.test.ts` — schema validation, negative enum cases.
- `src/mcp/execution/pricing.test.ts` — cost-control class to pricing model mapping.
- `src/mcp/execution/build.test.ts` — manifest mapping, non-AWS rejection, runtime fact overrides.
- `src/mcp/execution/attach.test.ts` — domain field preservation.
- `src/mcp/tools/manifest-contract.test.ts` — every AWS-backed manifest maps to valid execution metadata.

Run `pnpm run typecheck`, `pnpm test`, and `pnpm run test:integrity` before merge.
