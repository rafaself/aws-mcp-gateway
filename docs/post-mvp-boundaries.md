# Post-MVP expansion security boundaries

This document defines the security and product boundaries for capabilities that are intentionally **outside** the current read-only MVP. It exists to prevent gradual scope creep — write operations, generic AWS access, or broader authorization behavior must not be added without a separate design and explicit review.

For repository workflow rules, see [AGENTS.md](../AGENTS.md). For spec-driven development when a change requires a design document, see [docs/specs/README.md](specs/README.md).

## Current MVP contract

The gateway today is a minimal Cloudflare Worker MCP gateway with **explicit, read-only AWS tools**. The MVP contract is:

- MCP endpoint protected by bearer authentication.
- Each tool is named, typed, and allowlisted — no generic executor.
- AWS credentials stored only as Cloudflare secrets with least-privilege read-only IAM.
- Inputs validated (region allowlist, date ranges, result-size limits) before any AWS call.
- Normalized tool output only — never raw AWS response bodies.
- Optional KV caching for repeated or costly reads.

**Forbidden in the MVP and permanently forbidden as a pattern:**

- Generic AWS CLI execution (`run_aws_cli` or equivalent).
- Arbitrary AWS API proxying (`call_any_aws_api` or equivalent).
- Write or management operations.

Post-MVP work described below does **not** relax these prohibitions unless a reviewed spec explicitly replaces a boundary and the change is approved through the normal review process.

---

## Management and write operations

Future write or management tools (for example: start/stop instances, modify alarms, change budgets) are **out of scope for the MVP** and require a separate security model.

### Requirements before implementation

Any write or management capability must:

1. **Be designed in a separate spec** before code changes. Copy [docs/specs/template.md](specs/template.md) and follow [docs/specs/README.md](specs/README.md). The spec is the source of truth for acceptance criteria.
2. **Use separate IAM permissions** from read-only tools. Write actions must not be added to the read-only IAM policy in `infra/aws/iam-readonly-policy.json`. Deploy a distinct principal, policy, or credential set for management tools.
3. **Be disabled by default.** Management tools must not be active unless explicitly enabled in configuration (for example, an env flag or tool-level allowlist).
4. **Require explicit tool-level allowlisting.** Each management tool must be individually named and registered; there is no blanket “management mode” that exposes arbitrary APIs.
5. **Require confirmation or approval semantics** appropriate to the action risk (for example: dry-run output, explicit `confirm: true` input, or a two-step approve-then-execute flow for destructive actions).
6. **Emit audit events.** Log who invoked which tool, with what inputs (redacted), outcome, and timestamp. Audit logs must not contain secrets, tokens, or raw AWS credentials.
7. **Include rollback and failure behavior in the spec.** Document partial-failure handling, idempotency expectations, and operator recovery steps.
8. **Never be introduced as a generic AWS CLI or arbitrary API proxy.** Each tool maps to a narrow, reviewed AWS action with validated inputs and normalized outputs.

### Acceptance expectations for future write/management work

| Area | Required verification |
|------|----------------------|
| IAM separation | Contract tests or integration checks prove read-only deployment cannot invoke write actions |
| Default-off | Tests prove management tools reject calls when not explicitly enabled |
| Allowlisting | Tests prove only registered management tools are exposed |
| Confirmation | Tests prove high-risk actions fail without required confirmation input |
| Audit | Tests or manual verification prove audit events are emitted and redacted |
| Failure handling | Tests cover AWS errors, timeouts, and partial success per the spec |
| No generic proxy | Review checklist confirms no `run_aws_cli` / `call_any_aws_api` pattern |

---

## OAuth and multi-user authentication

The MVP uses a **single shared bearer token** (`MCP_AUTH_TOKEN`) suitable for personal or single-tenant deployment. OAuth or multi-user auth is **not required for the MVP** and must not weaken the current model unless explicitly replaced by a reviewed design.

### Requirements before implementation

Any future OAuth or multi-user auth must:

1. **Be designed separately** from the MVP bearer-auth model. Do not bolt OAuth onto the existing token check without a dedicated spec covering identity, storage, and authorization.
2. **Define user identity, token storage, revocation, and authorization boundaries.** Document how users are identified, how tokens are issued and stored, how revocation works, and which tools each principal may call.
3. **Not weaken single-token deployment mode** unless explicitly replaced. The current bearer-token path must remain available (or be migrated with a documented cutover) for operators who do not need multi-user auth.
4. **Include tests for auth edge cases:** unauthorized requests, expired tokens, malformed tokens, and insufficient-scope requests must all fail with safe, normalized errors — never raw provider responses or stack traces.

### Acceptance expectations for future OAuth/multi-user work

| Area | Required verification |
|------|----------------------|
| Unauthorized | Contract tests reject missing or invalid credentials |
| Expired | Contract tests reject expired tokens |
| Malformed | Contract tests reject malformed Authorization headers and tokens |
| Insufficient scope | Contract tests reject principals without permission for the requested tool |
| MVP compatibility | Documented behavior for single-token mode unchanged unless spec defines migration |
| Secret safety | Tests prove tokens and credentials never appear in responses or logs |

---

## Broader AWS inventory (read-only expansion)

Future read-only tools — such as RDS instance listing, Lambda function listing, budget status, cost forecasts, or service inventory — extend the MVP but **remain within the read-only boundary**.

Examples mentioned in the roadmap (not yet implemented):

```text
get_aws_daily_cost_trend
get_aws_cost_forecast
get_budget_status
list_rds_instances
list_lambda_functions
get_service_inventory
```

### Requirements before implementation

Each new read-only tool must:

1. **Remain an explicit MCP tool** with a fixed name, Zod input schema, and documented output contract (see [docs/tooling-conventions.md](tooling-conventions.md) and [docs/mcp-tools.md](mcp-tools.md)).
2. **Use narrow AWS actions** added only to the read-only IAM policy with least privilege. No `*` actions or broad `Describe*` wildcards without justification in the spec.
3. **Validate region, date, and result-size inputs** before AWS calls, consistent with existing security helpers in `src/security/`.
4. **Return normalized output only** — `content` plus `structuredContent`; never raw AWS response bodies.
5. **Use cache where repeated calls could be costly**, following existing TTL patterns in the cost and inventory tools.
6. **Include contract tests** for output shape, validation failures, region allowlist enforcement, and AWS error normalization.

### Acceptance expectations for future read-only tools

| Area | Required verification |
|------|----------------------|
| Tool contract | Tests match documented input/output in `docs/mcp-tools.md` |
| Validation | Contract tests for invalid regions, dates, and limits |
| IAM | New actions documented in IAM policy and setup docs |
| Output shape | Tests assert normalized fields; no raw AWS payloads |
| Caching | Tests for cache hit/miss behavior when caching applies |
| Errors | Tests prove safe error messages without secrets or stack traces |

---

## Cost and observability expansion

Future expansion of cost tools (forecasts, anomalies, budgets) or observability tools (logs, metrics, traces) must preserve the controls that keep the gateway safe and affordable.

### Requirements before implementation

Any cost or observability expansion must:

1. **Preserve cost controls.** Cache paid API calls (Cost Explorer, forecasts) with appropriate TTLs. Reject overly broad date ranges and result counts before calling AWS.
2. **Preserve log message truncation and redaction rules.** Log and error content must be truncated and scanned for secrets; follow patterns in `src/security/`.
3. **Avoid returning raw AWS response bodies.** All output goes through normalization layers in AWS client modules.
4. **Avoid unbounded time ranges or result counts.** Every query must have explicit upper bounds enforced at validation time.

### Acceptance expectations for future cost/observability work

| Area | Required verification |
|------|----------------------|
| Date/range limits | Contract tests reject out-of-range requests |
| Result-size limits | Contract tests reject or truncate excessive result sets |
| Redaction | Contract tests prove secrets and tokens are not in output |
| Caching | Tests prove Cost Explorer-style calls use cache when configured |
| Raw response ban | Review confirms no tool returns unmodified AWS JSON |

---

## How to propose post-MVP work

1. Open a GitHub issue describing the capability and link to the relevant section of this document.
2. For non-trivial changes, add a spec under `docs/specs/` before implementation.
3. Keep PRs small and focused; do not mix MVP fixes with post-MVP features.
4. Update IAM docs (`docs/aws-iam-setup.md`, `infra/aws/iam-readonly-policy.json`) only when the spec approves new read-only actions — never add write permissions to the read-only policy.
5. Add or extend contract tests for every new boundary introduced.

## Related documentation

- [README.md](../README.md) — project overview and MVP security model
- [docs/mcp-tools.md](mcp-tools.md) — current tool contracts
- [docs/tooling-conventions.md](tooling-conventions.md) — naming, validation, and output rules
- [docs/specs/README.md](specs/README.md) — when and how to write implementation specs
- [AGENTS.md](../AGENTS.md) — agent and contributor workflow rules
