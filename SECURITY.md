# Operational security checklist

Use this document before deploying the gateway and before merging security-sensitive changes. It consolidates the read-only safety contract into verifiable checklists without replacing detailed tool contracts, deployment steps, or contributor workflow rules.

**Related documentation:**

- [README.md](README.md) — project overview and security model summary
- [AGENTS.md](AGENTS.md) — contributor workflow and test integrity rules
- [docs/mcp-tools.md](docs/mcp-tools.md) — per-tool input, output, and limit contracts
- [docs/chatgpt-connector-production-acceptance.md](docs/chatgpt-connector-production-acceptance.md) — final ChatGPT Connector production acceptance gate
- [docs/aws-iam-setup.md](docs/aws-iam-setup.md) — IAM user and credential setup
- [docs/aws-tools.md](docs/aws-tools.md) — generic direct-input AWS tools (no profiles required)
- [docs/application-profiles.md](docs/application-profiles.md) — optional KV-backed operational context
- [docs/iam-cross-account.md](docs/iam-cross-account.md) — multi-account AssumeRole IAM pattern
- [docs/deployment.md](docs/deployment.md) — deployment and verification steps
- [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md) — requirements for future expansion

## Reporting security issues

If you discover a security vulnerability in this project, open a private GitHub security advisory or contact the repository maintainer directly. Do not open a public issue with exploit details, credentials, or live account identifiers.

---

## Read-only security scope

The gateway is a **read-only**, public-facing MCP endpoint for explicit AWS tools. The current read-only scope is:

- Each MCP tool is named, typed, and allowlisted — AWS access is mediated through project code, not a generic proxy.
- AWS credentials and MCP auth tokens live only in Cloudflare secrets, never in Git.
- Tool inputs are validated (region allowlist, date ranges, result-size limits) before any AWS call.
- Tool output is normalized; raw AWS response bodies are never returned.
- Optional KV caching stores normalized tool output only.

**Read-only guarantees (current):**

- [ ] The gateway remains read-only in the current scope — no write or management AWS actions are exposed as MCP tools.
- [ ] No generic AWS CLI execution tool (for example, `run_aws_cli`) exists in the codebase.
- [ ] No arbitrary AWS API proxy tool (for example, `call_any_aws_api`) exists in the codebase.
- [ ] Every AWS-backed tool maps to a narrow, reviewed action with validated inputs and normalized outputs (see [docs/mcp-tools.md](docs/mcp-tools.md)).

**Out of scope for this document:**

- Full deployment instructions — see [docs/deployment.md](docs/deployment.md).
- Write-operation policy — see [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md).
- Automated dependency or SAST vulnerability scanning — not required for the current read-only scope.

**CI secret scanning (in scope on every PR and `main` push):**

- Gitleaks — [`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml).
- Repository safety — `pnpm run repo:safety` in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**OAuth (implemented):**

- ChatGPT connector OAuth is documented in [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md).
- Contract: [docs/specs/oauth-chatgpt-connector.md](docs/specs/oauth-chatgpt-connector.md).
- ChatGPT action visibility requires authenticated `tools/list` with valid descriptors for every **enabled** tool; disabled or pack-gated tools are omitted from `tools/list` and do not appear as ChatGPT Actions. `search`/`fetch` are catalog helpers only.
- OAuth mode requires the `AUTH_RATE_LIMITER` Durable Object binding so `/mcp` request throttling happens before the MCP runtime or AWS-backed tools execute.

---

## Public repository safety rules

This repository is intended to be public-safe. Before pushing or opening a PR:

- [ ] No AWS access keys, secret access keys, or session tokens appear in commits, issues, or PR descriptions.
- [ ] No MCP bearer tokens, Cloudflare API tokens, or OAuth client secrets appear in commits.
- [ ] `.env`, `.dev.vars`, and `.wrangler/` are not tracked (see [.gitignore](.gitignore)).
- [ ] CI runs `pnpm run repo:safety` on every pull request and push to `main` via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- [ ] CI runs Gitleaks secret-pattern scanning on every pull request and push to `main` via [`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml).
- [ ] CI runs `pnpm run output:guardrail` on every pull request and push to `main` via [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- [ ] Only [`.env.example`](.env.example) documents secret names — it contains no real values.
- [ ] `wrangler.jsonc` `[vars]` contains operational configuration only (regions, app name), not credentials.
- [ ] Documentation examples use placeholders, not real account IDs, ARNs, log group names, or worker URLs tied to a live deployment.

---

## Runtime configuration checklist

Configure secrets with `wrangler secret put` and non-secret vars in `wrangler.jsonc`. See [README.md](README.md#configuration) for the full list.

- [ ] `AWS_ACCESS_KEY_ID` is set as a Cloudflare secret (not in Git or `[vars]`).
- [ ] `AWS_SECRET_ACCESS_KEY` is set as a Cloudflare secret (not in Git or `[vars]`).
- [ ] `MCP_AUTH_TOKEN` is set as a Cloudflare secret with a strong, unique value.
- [ ] `AWS_REGION` is set in `[vars]` and matches the primary region for regional tools.
- [ ] `AWS_ALLOWED_REGIONS` is set in `[vars]` as a non-empty comma-separated allowlist.
- [ ] `AWS_REGION` is included in `AWS_ALLOWED_REGIONS`.
- [ ] `AUTH_RATE_LIMITER` Durable Object binding and migration are configured for OAuth deployments.
- [ ] `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_SECONDS` are set (or intentionally left at documented defaults).
- [ ] Optional KV binding `AWS_MCP_CACHE` is configured in production if caching is desired (see [docs/deployment.md](docs/deployment.md)).
- [ ] Optional KV binding `AWS_MCP_APP_CONFIG` is used only for application profiles — a separate namespace from `AWS_MCP_CACHE` (see [docs/application-profiles.md](docs/application-profiles.md)).
- [ ] Missing or invalid required bindings return a normalized `configuration_error` response — not raw stack traces or binding dumps to unauthenticated callers.

---

## AWS IAM checklist

The canonical read-only policy template is [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json). Setup walkthrough: [docs/aws-iam-setup.md](docs/aws-iam-setup.md).

- [ ] The gateway IAM principal uses the project read-only policy — not `AdministratorAccess` or broad AWS-managed policies.
- [ ] IAM policy actions are limited to read-only APIs required by current MCP tools (Cost Explorer, EC2 describe, CloudWatch, CloudWatch Logs).
- [ ] No write, create, delete, modify, or `*` actions are granted for the current read-only deployment.
- [ ] IAM credentials used by the gateway are dedicated to this service — not shared personal admin keys.
- [ ] Access keys are rotatable without changing application code (update Cloudflare secrets only).

---

## MCP authentication checklist

- [ ] With valid runtime configuration, `/mcp` rejects missing or invalid authentication with HTTP 401 before creating an MCP server instance.
- [ ] Unauthorized failures return the normalized error contract (`code: unauthorized`).
- [ ] `/health` responds without authentication and returns only `{ ok, service }` — no credentials, tokens, region config, cache state, or AWS metadata.
- [ ] Configuration errors on `/mcp` do not expose missing binding names to unauthenticated callers.

---

## Tool allowlist checklist

Tools are registered explicitly via manifest-backed definitions in `src/mcp/tools/`. There is no dynamic or runtime tool discovery. ChatGPT action visibility depends on authenticated `tools/list` returning valid descriptors for every **enabled** tool.

- [ ] The registry defines **38** public tools (see [docs/mcp-tools.md](docs/mcp-tools.md)).
- [ ] Default deployments expose **21** tools via packs `core`, `cost`, `inventory`, `observability`, and `database` (see [docs/aws-tools.md](docs/aws-tools.md)).
- [ ] Three **opt-in** aggregate tools (`aws_account_overview`, `aws_cost_overview`, `aws_observability_overview`) require the `aggregates` pack in `AWS_MCP_ENABLED_TOOL_PACKS`.
- [ ] Three **opt-in** security tools (`check_ssm_parameter_inventory`, `get_s3_bucket_posture`, `get_ses_configuration_status`) require the `security` pack.
- [ ] Nine **opt-in** application-ops tools require the `application-ops` pack and optional `AWS_MCP_APP_CONFIG` KV — profiles are not required for generic tools.
- [ ] Authenticated `tools/list` returns only enabled tools with valid `title`, `description`, `inputSchema`, `outputSchema` (where applicable), read-only annotations, and OAuth `securitySchemes`.
- [ ] `search` and `fetch` are catalog helpers — they do not replace `tools/list` for ChatGPT action discovery.
- [ ] New tools are added only through manifest registration, policy/capability/cost-control metadata, and documented contracts in [docs/mcp-tools.md](docs/mcp-tools.md).
- [ ] No tool accepts arbitrary AWS service names, actions, or CLI commands as input.
- [ ] `get_gateway_status` makes no AWS calls and reports `mode: "read-only"`.
- [ ] `search` and `fetch` do not call AWS directly (except `fetch` may embed live `get_gateway_status` JSON for that catalog entry).

---

## Input limit checklist

Limits are enforced in `src/security/` before downstream AWS calls. Constants live in `src/security/limits.ts`.

- [ ] Regional tools reject regions not present in `AWS_ALLOWED_REGIONS`.
- [ ] An empty `AWS_ALLOWED_REGIONS` list causes validation failure at startup or tool invocation.
- [ ] Cost Explorer date ranges are bounded (maximum 90 days — `COST_MAX_DATE_RANGE_DAYS`).
- [ ] Cost-by-service result rows are capped (maximum 25 — `COST_MAX_SERVICE_ROWS`).
- [ ] CloudWatch Logs lookback is bounded (maximum 24 hours — `LOGS_MAX_HOURS`).
- [ ] CloudWatch Logs event count is bounded (maximum 50 — `LOGS_MAX_EVENTS`).
- [ ] CloudWatch Logs message length is truncated (maximum 1,000 characters — `LOGS_MAX_MESSAGE_LENGTH`).
- [ ] Invalid inputs fail with `validation_error` before any AWS API call.

---

## Cost-control policy checklist

Manifest-backed tools declare explicit `costControl` metadata in `src/mcp/tools/manifest.ts`. The central policy gate in `src/mcp/tools/policy.ts` evaluates cost-control constraints before handler execution and fails closed on missing or invalid metadata.

- [ ] Every AWS-backed tool manifest declares `costControl` with a non-`free` class, `requiresCache: true`, and `minCacheTtlSeconds` for paid, volume-sensitive, or fanout-sensitive tools.
- [ ] Non-AWS tools (`search`, `fetch`, `get_gateway_status`) declare `costControl.class: "free"` and `requiresCache: false`.
- [ ] Cost-control policy denials return generic `validation_error` messages without exposing internal numeric limits.
- [ ] Cost-control denials happen before handler execution and before AWS calls.
- [ ] Paid cost tools declare `maxDateRangeDays` (90 days) and cache TTL metadata (1800 seconds).
- [ ] Fanout-sensitive tools declare `maxRegions` bounded by `AWS_ALLOWED_REGIONS`.
- [ ] Volume-sensitive log tools declare `maxLookbackHours` (24) and `maxResultCount` (50).
- [ ] New AWS-backed tools must declare appropriate `costControl` metadata before merge (see [docs/tooling-conventions.md](docs/tooling-conventions.md)).

**Recommended deployment defaults:**

- Configure `AWS_MCP_CACHE` in production for expensive repeated reads (cost tools: 30-minute TTL; EC2, CloudWatch, and Logs: 5-minute TTL).
- Configure OAuth rate limiting via `AUTH_RATE_LIMITER` with `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_SECONDS` before exposing `/mcp` publicly.

See also [docs/specs/secure-tool-platform.md](docs/specs/secure-tool-platform.md) for the cost-control model.

---

## Manifest metadata checklist

Every public tool must have exactly one manifest factory in `src/mcp/tools/definitions/*.ts`, registered via `src/mcp/tools/registry.ts`. Shared manifest types and conversion live in `src/mcp/tools/manifest.ts`.

- [ ] Each manifest declares `name`, `title`, `description`, `pack`, `lifecycle`, `visibility`, `auth`, `aws`, `safety`, `costControl`, `audit`, `descriptorKind`, and `handler`.
- [ ] AWS-backed manifests declare `aws.services`, `aws.actions`, `aws.capabilities`, `aws.regionMode`, and `aws.readonly: true`.
- [ ] Non-AWS tools (`search`, `fetch`, `get_gateway_status`) declare empty AWS metadata and `costControl.class: "free"`.
- [ ] Tools with structured output declare `outputSchema`.
- [ ] Non-discovery tools declare ChatGPT `catalog` metadata (`keywords`, `docsAnchor`, `inputSummary`).
- [ ] Contract tests pass: `src/mcp/tools/manifest-contract.test.ts`.

---

## Policy gate checklist

The central policy gate in `src/mcp/tools/policy.ts` evaluates `evaluateToolPolicy()` before handler execution.

- [ ] Disabled tools, disabled packs, and non-read-only risk levels are denied before handler or AWS work.
- [ ] AWS-backed tools with missing or non-allowlisted service/action metadata fail closed.
- [ ] Cost-control manifest and request limits are enforced before handler execution.
- [ ] Region allowlist enforcement remains in effect for regional tools.
- [ ] Policy denials return normalized `validation_error` MCP responses — not raw stack traces or AWS payloads.
- [ ] Policy denials emit sanitized audit metadata and do not call AWS.
- [ ] Contract tests pass: `src/mcp/tools/policy.test.ts`, `src/mcp/tools/cost-control-policy.test.ts`.

---

## Capability metadata checklist

AWS capability metadata links tools to IAM actions and read-only posture.

- [ ] Every AWS-backed manifest declares `aws.capabilities` aligned with `src/aws/capabilities.ts`.
- [ ] [`docs/aws-capability-matrix.md`](docs/aws-capability-matrix.md) is updated when tools or capabilities change.
- [ ] IAM policy template [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json) exactly matches declared capabilities — no undocumented actions.
- [ ] Aggregate overview tools compose existing APIs — they do not require new IAM actions beyond the read-only policy.
- [ ] Contract tests pass: `src/mcp/tools/capability-contract.test.ts`, `src/mcp/tools/capability-matrix.test.ts`, `src/aws/iam-readonly-policy.test.ts`.

---

## Tool exposure checklist

Tool exposure is configured via environment variables (see [README.md](README.md#tool-exposure-optional)).

- [ ] `AWS_MCP_ENABLED_TOOL_PACKS` controls which packs are exposed (default: `core,cost,inventory,observability`).
- [ ] `AWS_MCP_DISABLED_TOOLS` and optional `AWS_MCP_ENABLED_TOOLS` further restrict exposure.
- [ ] Disabled or pack-gated tools are omitted from `tools/list` and denied on direct invocation.
- [ ] `AWS_MCP_MAX_RISK_LEVEL` is `read-only` (only supported value today).
- [ ] Contract tests pass: `src/mcp/tools/exposure.test.ts`, `src/mcp/tools/list-integration.test.ts`.

---

## Cache safety checklist

Caching is optional via the `AWS_MCP_CACHE` KV binding. See [README.md](README.md#optional-kv-namespace).

- [ ] Cache keys are SHA-256 hashes of tool name and normalized input parameters (`src/cache/keys.ts`) — not raw credentials or auth headers.
- [ ] Cached values contain normalized tool output only — never raw AWS response bodies.
- [ ] Cache keys and values do not include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `MCP_AUTH_TOKEN`.
- [ ] Cache TTLs match documented values: 30 minutes for cost tools, 5 minutes for EC2, CloudWatch, and Logs tools.
- [ ] KV read/write failures degrade gracefully (fall through to AWS) without exposing secrets in logs.
- [ ] `AWS_MCP_APP_CONFIG` is never used for tool response caching or credential storage — only profile documents and index metadata.

---

## Application profile safety checklist

Application profiles are optional operational context. See [docs/application-profiles.md](docs/application-profiles.md).

- [ ] Profiles store resource names, regions, display metadata, and optional `auth.strategy` role ARNs — not credentials or secret values.
- [ ] Profiles are **not authorization** — OAuth scopes, tool packs, IAM, and region allowlists remain the security boundary.
- [ ] Missing or invalid `AWS_MCP_APP_CONFIG` does not break `/mcp` or generic AWS tools.
- [ ] Profile JSON and KV documents **must never** contain `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `DATABASE_URL`, `JWT_SECRET`, passwords, bearer tokens, connection strings, or SSM parameter values.
- [ ] Assumed-role temporary credentials are never written to KV — only held in Worker memory via the credential resolver.
- [ ] Profile management scripts (`pnpm run app-profile:*`) output metadata only and never print secret-looking values.

---

## SSM metadata-only checklist

SSM inventory tools verify parameter **existence and metadata** only — never parameter values.

- [ ] `check_ssm_parameter_inventory` calls `ssm:DescribeParameters` only — not `GetParameter` or `GetParameters`.
- [ ] `get_application_secret_inventory` uses configured parameter **names** from profiles — metadata-only, same boundary.
- [ ] Tool output does not include SSM parameter values, SecureString payloads, or decrypted content.
- [ ] IAM policies for SSM inventory do not grant `ssm:GetParameter*` unless a future explicit tool requires it with a separate security review.

---

## Log tool sensitivity checklist

CloudWatch Logs tools return bounded, truncated event messages that may still contain sensitive application data.

- [ ] `get_cloudwatch_logs` and `get_recent_log_errors` enforce lookback, event count, and message length limits (`src/security/limits.ts`).
- [ ] Log message bodies are truncated — they are **not** guaranteed free of secrets, tokens, or PII.
- [ ] Operators treat log tool output and related audit summaries as potentially sensitive in ChatGPT sessions.
- [ ] Audit and application logs do not echo full raw log message bodies when avoidable.

---

## OAuth scope checklist

- [ ] Production deployments recommend `OAUTH_REQUIRED_SCOPES=aws:read` (see [wrangler.example.jsonc](wrangler.example.jsonc)).
- [ ] `/mcp` validates tokens against `OAUTH_REQUIRED_SCOPES` before tool execution.
- [ ] Per-tool `auth.requiredScopes` in manifests are enforced by the policy gate (`src/mcp/tools/policy.ts`) — future domain scopes (for example `aws:cost`) can be required per tool without listing every domain scope globally in `OAUTH_REQUIRED_SCOPES`.
- [ ] ChatGPT connector setup uses scope `aws:read` unless a deployment explicitly documents additional required scopes.

---

## Execution metadata checklist

Execution metadata on AWS-backed tool results (`structuredContent.execution`) is defined in [`docs/specs/tool-execution-metadata.md`](docs/specs/tool-execution-metadata.md).

- [ ] Metadata includes only sanitized cache status, AWS service/action names, optional region names, request counts, and gateway-side cost estimates.
- [ ] Metadata never includes secrets, bearer or OAuth tokens, cache keys, raw AWS response bodies, request payloads, billing account identifiers, or stack traces.
- [ ] `billing.estimatedCostUsd` and visible billing notes are labeled as estimates — not final AWS invoice totals.
- [ ] Execution metadata is not a durable audit ledger; structured audit events remain in `src/observability/audit.ts`.
- [ ] Cloudflare Worker, KV, Durable Object, and bandwidth costs are not included in AWS billing estimates.
- [ ] Contract tests pass: `src/mcp/tools/execution-contract.test.ts`, `src/mcp/tools/manifest-contract.test.ts`.

---

## Audit and logging checklist

Audit events are emitted from `src/observability/audit.ts` via `safeEmitAuditEvent` in `src/mcp/audit/log.ts` and tool handlers via `safeMcpHandler`.

- [ ] Successful and failed tool calls emit structured JSON audit events with tool name, outcome, and duration.
- [ ] Audit `input` fields use sanitized summaries (for example, region counts, date-range flags) — not full raw tool arguments when sensitive.
- [ ] Audit events do not include bearer tokens, AWS credentials, signed headers, or raw AWS response payloads.
- [ ] Audit logging failures are swallowed and do not change public MCP tool behavior.
- [ ] Application logs use `src/observability/logging.ts` and do not print `MCP_AUTH_TOKEN`, AWS secret keys, or raw provider error bodies.
- [ ] Production source does not call `console.*` outside `src/observability/`.

---

## Error redaction checklist

Public errors use the normalized contract in `src/errors/public-error.ts`.

- [ ] HTTP errors return `{ error: { code, message, retryable } }` — never raw stack traces.
- [ ] MCP tool errors return `mcpErrorResult` with `structuredContent.error.code` and `retryable` — not internal exception details.
- [ ] Unexpected exceptions are mapped to `internal_error` with a generic message.
- [ ] AWS client modules normalize provider failures before they reach MCP handlers.
- [ ] Tool responses expose documented normalized fields in `structuredContent` — not unmodified AWS JSON.

---

## Dependency and CI checklist

Before merging any PR:

- [ ] `pnpm run typecheck` passes locally or in CI.
- [ ] `pnpm test` passes — unit tests do not call live AWS or unmocked external services.
- [ ] `pnpm run test:integrity` passes — no committed `.only` markers or unjustified skipped tests.
- [ ] `pnpm run output:guardrail` passes — production source uses centralized observability sinks only.
- [ ] GitHub Actions CI workflow (`.github/workflows/ci.yml`) passes on the PR.
- [ ] GitHub Actions secret-scan workflow (`.github/workflows/secret-scan.yml`) passes on the PR.
- [ ] `pnpm run repo:safety` passes — no secrets, maintainer defaults, or forbidden paths in tracked files.
- [ ] New production dependencies are justified and reviewed — the project avoids unnecessary packages.
- [ ] Security, validation, redaction, authentication, region allowlist, and read-only contract tests were not weakened to make unrelated changes pass.

---

## Pre-deployment checklist

Complete this immediately before `pnpm deploy` or promoting a Worker version:

- [ ] All sections above relevant to this release are checked.
- [ ] Secrets are configured in the target Cloudflare environment (`wrangler secret put`).
- [ ] `AUTH_MODE` is set appropriately: `oauth` for ChatGPT production, `local-bearer` for local/single-token deployments.
- [ ] In `oauth` mode: OAuth vars are set and `MCP_AUTH_TOKEN` is **not** required; `GET /.well-known/oauth-protected-resource` returns expected metadata.
- [ ] In `local-bearer` mode: `MCP_AUTH_TOKEN` secret is configured.
- [ ] `AWS_ALLOWED_REGIONS` reflects only regions this deployment should serve.
- [ ] IAM policy attached to the gateway principal matches [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json) (or a narrower custom variant).
- [ ] Full pre-deploy validation passes on the commit being deployed (`pnpm run repo:safety`, `pnpm run output:guardrail`, `pnpm run verify:connector-contract`, `pnpm run typecheck`, `pnpm test`, `pnpm run test:integrity` — see [docs/deployment.md](docs/deployment.md)).
- [ ] `GET /health` returns `{ "ok": true, "service": "aws-mcp-gateway" }` without authentication.
- [ ] With valid runtime configuration, `POST /mcp` without authentication returns HTTP 401 (with `WWW-Authenticate` in `oauth` mode).
- [ ] Authenticated MCP access works (local bearer token or ChatGPT OAuth flow — see [docs/mcp-testing.md](docs/mcp-testing.md)).
- [ ] For ChatGPT production connectors, complete the production acceptance checklist in [docs/chatgpt-connector-production-acceptance.md](docs/chatgpt-connector-production-acceptance.md) — including authenticated `tools/list` validation for **enabled** tools only, OAuth login, Actions visible, `get_gateway_status`, optional `search`/`fetch`, and a bounded AWS tool. Default deployments expect 21 tools; enabling `aggregates` adds three; enabling `security` adds three; enabling `application-ops` adds nine. Detailed step-by-step responses: [docs/chatgpt-connector-smoke-test.md](docs/chatgpt-connector-smoke-test.md).
- [ ] A smoke test confirms at least one AWS-backed tool returns normalized output in an allowed region.

---

## Post-MVP boundary reminder

The following post-MVP capabilities require a separate issue, spec, and security review before implementation:

- Write or management AWS operations (start/stop instances, modify alarms, etc.).
- Broader read-only inventory tools (RDS, Lambda, budgets) — allowed only as explicit new tools with IAM and contract updates.

OAuth for ChatGPT is **implemented** — see [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md). Local bearer mode remains available for local development.

The following patterns remain permanently forbidden and must not be routed through the post-MVP process:

- Generic AWS CLI execution.
- Arbitrary AWS API proxying.

See [docs/post-mvp-boundaries.md](docs/post-mvp-boundaries.md) for acceptance expectations before any post-MVP work begins.

When reviewing a PR, ask: **Does this change preserve read-only, allowlisted, normalized-access behavior?** If not, stop and route the work through the post-MVP process.
