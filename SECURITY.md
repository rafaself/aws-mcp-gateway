# Operational security checklist

Use this document before deploying the gateway and before merging security-sensitive changes. It consolidates the read-only safety contract into verifiable checklists without replacing detailed tool contracts, deployment steps, or contributor workflow rules.

**Related documentation:**

- [README.md](README.md) — project overview and security model summary
- [AGENTS.md](AGENTS.md) — contributor workflow and test integrity rules
- [docs/mcp-tools.md](docs/mcp-tools.md) — per-tool input, output, and limit contracts
- [docs/chatgpt-connector-production-acceptance.md](docs/chatgpt-connector-production-acceptance.md) — final ChatGPT Connector production acceptance gate
- [docs/aws-iam-setup.md](docs/aws-iam-setup.md) — IAM user and credential setup
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
- Automated vulnerability scanning — not required for the current read-only scope.

**OAuth (implemented):**

- ChatGPT connector OAuth is documented in [docs/auth-chatgpt-oauth.md](docs/auth-chatgpt-oauth.md).
- Contract: [docs/specs/oauth-chatgpt-connector.md](docs/specs/oauth-chatgpt-connector.md).
- ChatGPT action visibility requires authenticated `tools/list` with valid descriptors for all 8 public tools; `search`/`fetch` are catalog helpers only.
- OAuth mode requires the `AUTH_RATE_LIMITER` Durable Object binding so `/mcp` request throttling happens before the MCP runtime or AWS-backed tools execute.

---

## Public repository safety rules

This repository is intended to be public-safe. Before pushing or opening a PR:

- [ ] No AWS access keys, secret access keys, or session tokens appear in commits, issues, or PR descriptions.
- [ ] No MCP bearer tokens, Cloudflare API tokens, or OAuth client secrets appear in commits.
- [ ] `.env`, `.dev.vars`, and `.wrangler/` are not tracked (see [.gitignore](.gitignore)).
- [ ] Only [`.env.example`](.env.example) documents secret names — it contains no real values.
- [ ] `wrangler.jsonc` `[vars]` contains operational configuration only (regions, app name), not credentials.
- [ ] Documentation examples use placeholders, not real account IDs, ARNs, log group names, or worker URLs tied to a live deployment.

---

## Runtime configuration checklist

Configure secrets with `wrangler secret put` and non-secret vars in `wrangler.jsonc`. See [README.md](README.md#environment-variables-and-secrets) for the full list.

- [ ] `AWS_ACCESS_KEY_ID` is set as a Cloudflare secret (not in Git or `[vars]`).
- [ ] `AWS_SECRET_ACCESS_KEY` is set as a Cloudflare secret (not in Git or `[vars]`).
- [ ] `MCP_AUTH_TOKEN` is set as a Cloudflare secret with a strong, unique value.
- [ ] `AWS_REGION` is set in `[vars]` and matches the primary region for regional tools.
- [ ] `AWS_ALLOWED_REGIONS` is set in `[vars]` as a non-empty comma-separated allowlist.
- [ ] `AWS_REGION` is included in `AWS_ALLOWED_REGIONS`.
- [ ] `AUTH_RATE_LIMITER` Durable Object binding and migration are configured for OAuth deployments.
- [ ] `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_SECONDS` are set (or intentionally left at documented defaults).
- [ ] Optional KV binding `AWS_MCP_CACHE` is configured in production if caching is desired (see [docs/deployment.md](docs/deployment.md)).
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

Tools are registered explicitly in `src/mcp/tools/`. There is no dynamic or runtime tool discovery. ChatGPT action visibility depends on authenticated `tools/list` returning valid descriptors for every public tool.

- [ ] Only registered MCP tools are exposed — currently **8** public tools: `search`, `fetch`, `get_gateway_status`, `get_aws_cost_summary`, `get_aws_cost_by_service`, `list_ec2_instances`, `get_cloudwatch_alarms`, `get_recent_log_errors`.
- [ ] Authenticated `tools/list` returns all 8 tools with valid `title`, `description`, `inputSchema`, `outputSchema` (where applicable), read-only annotations, and OAuth `securitySchemes`.
- [ ] `search` and `fetch` are catalog helpers — they do not replace `tools/list` for ChatGPT action discovery.
- [ ] New tools are added only through explicit registration and documented contracts in [docs/mcp-tools.md](docs/mcp-tools.md).
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

## Cache safety checklist

Caching is optional via the `AWS_MCP_CACHE` KV binding. See [README.md](README.md#optional-kv-namespace).

- [ ] Cache keys are SHA-256 hashes of tool name and normalized input parameters (`src/cache/keys.ts`) — not raw credentials or auth headers.
- [ ] Cached values contain normalized tool output only — never raw AWS response bodies.
- [ ] Cache keys and values do not include `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `MCP_AUTH_TOKEN`.
- [ ] Cache TTLs match documented values: 30 minutes for cost tools, 5 minutes for EC2, CloudWatch, and Logs tools.
- [ ] KV read/write failures degrade gracefully (fall through to AWS) without exposing secrets in logs.

---

## Audit and logging checklist

Audit events are emitted from `src/mcp/audit/log.ts` and tool handlers via `safeMcpHandler`.

- [ ] Successful and failed tool calls emit structured JSON audit events with tool name, outcome, and duration.
- [ ] Audit `input` fields use sanitized summaries (for example, region counts, date-range flags) — not full raw tool arguments when sensitive.
- [ ] Audit events do not include bearer tokens, AWS credentials, signed headers, or raw AWS response payloads.
- [ ] Audit logging failures are swallowed and do not change public MCP tool behavior.
- [ ] Application logs do not print `MCP_AUTH_TOKEN`, AWS secret keys, or raw provider error bodies.

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
- [ ] GitHub Actions CI workflow (`.github/workflows/ci.yml`) passes on the PR.
- [ ] New production dependencies are justified and reviewed — the project avoids unnecessary packages.
- [ ] Security, validation, redaction, authentication, region allowlist, and read-only contract tests were not weakened to make unrelated changes pass.

---

## Pre-deployment checklist

Complete this immediately before `pnpm deploy` or promoting a Worker version:

- [ ] All sections above relevant to this release are checked.
- [ ] Secrets are configured in the target Cloudflare environment (`wrangler secret put`).
- [ ] `AUTH_MODE` is set appropriately: `oauth` for ChatGPT production, `local-bearer` for local/single-token deployments (`legacy-bearer` is accepted as a deprecated alias).
- [ ] In `oauth` mode: OAuth vars are set and `MCP_AUTH_TOKEN` is **not** required; `GET /.well-known/oauth-protected-resource` returns expected metadata.
- [ ] In `local-bearer` mode: `MCP_AUTH_TOKEN` secret is configured.
- [ ] `AWS_ALLOWED_REGIONS` reflects only regions this deployment should serve.
- [ ] IAM policy attached to the gateway principal matches [`infra/aws/iam-readonly-policy.json`](infra/aws/iam-readonly-policy.json) (or a narrower custom variant).
- [ ] `pnpm run typecheck`, `pnpm test`, and `pnpm run test:integrity` pass on the commit being deployed.
- [ ] `pnpm run verify:connector-contract` passes on the commit being deployed (ChatGPT Connector local gate).
- [ ] `GET /health` returns `{ "ok": true, "service": "aws-mcp-gateway" }` without authentication.
- [ ] With valid runtime configuration, `POST /mcp` without authentication returns HTTP 401 (with `WWW-Authenticate` in `oauth` mode).
- [ ] Authenticated MCP access works (local bearer token or ChatGPT OAuth flow — see [docs/mcp-testing.md](docs/mcp-testing.md)).
- [ ] For ChatGPT production connectors, complete the production acceptance checklist in [docs/chatgpt-connector-production-acceptance.md](docs/chatgpt-connector-production-acceptance.md) — including authenticated `tools/list` validation, OAuth login, Actions visible (all 8 tools), `get_gateway_status`, optional `search`/`fetch`, and a bounded AWS tool. Detailed step-by-step responses: [docs/chatgpt-connector-smoke-test.md](docs/chatgpt-connector-smoke-test.md).
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
