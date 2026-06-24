# ChatGPT Connector production acceptance

Final production gate proving the deployed Worker is ready for integration as a **ChatGPT Connector App**. This checklist validates repository safety, deployment health, MCP transport behavior, tool descriptors, read-only actions, and ChatGPT UI acceptance.

Repository contract checks (manifest completeness, policy gates, capability matrix, cost-control metadata, descriptor shape, exposure, `tools/list`, OAuth challenge) are covered by step 1 (`pnpm run verify:connector-contract`).

**Related documentation:**

- [chatgpt-connector.md](chatgpt-connector.md) — connector contract and architecture
- [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md) — detailed step-by-step runbook with expected responses
- [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md) — Auth0 OAuth setup
- [dependency-upgrade-contract.md](dependency-upgrade-contract.md) — runtime dependency pin contract

Replace `<worker-host>` with your deployed Worker hostname. Do not paste real OAuth access tokens, AWS keys, or Auth0 client secrets into docs, issues, or terminal history.

## Exposure configuration

Record the deployed tool exposure settings before counting tools in steps 7, 8, and 16:

| Variable | Default | Effect |
|----------|---------|--------|
| `AWS_MCP_ENABLED_TOOL_PACKS` | `core,cost,inventory,observability,database` | Which tool packs are exposed |
| `AWS_MCP_ENABLED_TOOLS` | *(empty)* | Optional allowlist within enabled packs |
| `AWS_MCP_DISABLED_TOOLS` | *(empty)* | Explicit denylist |

**Default path:** 21 enabled tools (all default packs, no denylist).

**Aggregates-enabled path:** add `aggregates` to `AWS_MCP_ENABLED_TOOL_PACKS` for 24 enabled tools (includes `aws_account_overview`, `aws_cost_overview`, `aws_observability_overview`).

**Security-enabled path:** add `security` to default packs for 26 enabled tools (includes SSM inventory, S3 posture, SES, SNS, and EventBridge/Scheduler status tools).

Disabled or pack-gated tools must not appear in `tools/list` or as ChatGPT Actions.

## URL model

Confirm this split before any deployed or ChatGPT checks:

```text
ChatGPT Connector Server URL: https://<worker-host>/mcp
MCP_RESOURCE_URL and OAUTH_AUDIENCE: https://<worker-host> (origin only — do not append /mcp)
Protected resource metadata: https://<worker-host>/.well-known/oauth-protected-resource
Required scope: aws:read
Expected enabled MCP tools: 21 (default) or 24 (with aggregates pack)
```

---

## Production acceptance checklist

### 1. Repository validation passes locally

```bash
pnpm run repo:safety
pnpm run output:guardrail
pnpm run verify:connector-contract
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

`verify:connector-contract` runs typecheck, the full test suite (including connector contract tests), and `test:integrity`. The last three commands are listed explicitly to match [docs/deployment.md](deployment.md). No live ChatGPT, Auth0, Cloudflare, or AWS calls are required. Gitleaks scanning runs in CI via [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml).

| Contract surface | Guarded by |
|------------------|------------|
| Pinned runtime dependencies | `src/test/dependency-contract.test.ts` |
| OAuth URL origin (no `/mcp` on resource/audience) | `src/config/oauth-urls.test.ts` |
| Manifest completeness, pack mapping, cost-control metadata | `src/mcp/tools/manifest-contract.test.ts` |
| Public descriptor shape, OAuth security, no `noauth` | `src/mcp/tools/descriptor-contract.test.ts` |
| Policy denial before handler/AWS work | `src/mcp/tools/policy.test.ts` |
| Cost-control metadata and request limits | `src/mcp/tools/cost-control-policy.test.ts` |
| Capability/IAM alignment | `src/mcp/tools/capability-contract.test.ts` |
| Generated capability matrix doc | `src/mcp/tools/capability-matrix.test.ts` |
| Tool pack and disable exposure | `src/mcp/tools/exposure.test.ts` |
| HTTP `tools/list` returns enabled tools only (21 by default) | `src/mcp/tools/list-integration.test.ts` |
| `/mcp` 401 challenge and protected-resource metadata | `src/index.oauth.test.ts` |

Local acceptance (no deploy required):

- [ ] **1a.** `pnpm run repo:safety` passes — no secrets or maintainer defaults in tracked files
- [ ] **1b.** `pnpm run output:guardrail` passes — production logging uses `src/observability/` only
- [ ] **1c.** `pnpm run verify:connector-contract` passes — manifest, policy, capability, cost-control, exposure, and connector contracts hold
- [ ] **1d.** Capability matrix covers all registered AWS tools (`capability-matrix.test.ts`)
- [ ] **1e.** Cost-control metadata covers all registered tools (`manifest-contract.test.ts`, `cost-control-policy.test.ts`)
- [ ] **1f.** Disabled tools are omitted from `tools/list` (`exposure.test.ts`, `list-integration.test.ts`)

### 2. Worker deploy succeeds

Deploy with `AUTH_MODE=oauth` and OAuth vars configured (see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md)).

```bash
pnpm deploy
# or: pnpm run deploy:configured
```

- [ ] **2.** Deploy completes without errors

### 3. `/health` returns 200

```bash
curl -sS https://<worker-host>/health
```

**Expected:** HTTP `200`, body `{ "ok": true, "service": "aws-mcp-gateway" }`. No credentials or AWS configuration exposed.

- [ ] **3.** `/health` returns 200

### 4. `/.well-known/oauth-protected-resource` returns valid metadata

```bash
curl -sS https://<worker-host>/.well-known/oauth-protected-resource
```

**Expected:** HTTP `200`; JSON includes `resource` (Worker origin), `authorization_servers`, `scopes_supported` (includes `aws:read`), and `resource_documentation`.

- [ ] **4.** Protected resource metadata is valid

### 5. Unauthenticated `/mcp` returns 401 with WWW-Authenticate Bearer challenge

```bash
curl -i -X POST https://<worker-host>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Expected:** HTTP `401`; `WWW-Authenticate` includes `Bearer`, `resource_metadata=`, `scope=` (includes `aws:read`), and `error="invalid_token"`.

Optional automated check: `pnpm run verify:oauth https://<worker-host>`.
Optional authenticated smoke check: `pnpm run verify:oauth:authenticated`.

- [ ] **5.** Unauthenticated `/mcp` returns OAuth 401 challenge

### 6. Authenticated `initialize` succeeds

Obtain an OAuth access token through the ChatGPT connector flow or your OIDC provider (staging). Use placeholders only in docs and scripts.

Automated alternative: configure the smoke OAuth variables from `.env.deploy.local` and run `pnpm run verify:oauth:authenticated`. This covers steps 6 through 12 without the ChatGPT UI.

```bash
curl -i -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"acceptance","version":"1.0.0"}}}'
```

**Expected:** HTTP `200` with a valid `initialize` result and response header `mcp-session-id` (UUID).

- [ ] **6.** Authenticated `initialize` succeeds

### 7. Authenticated `tools/list` returns only enabled tools

```bash
curl -sS -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Expected (default exposure — 21 tools):** `result.tools` includes exactly:

```text
search
fetch
get_gateway_status
get_aws_cost_summary
get_aws_cost_by_service
get_budget_status
list_ec2_instances
list_lambda_functions
list_s3_buckets
get_ecr_image_status
compare_ecs_task_image_with_ecr
get_cloudwatch_alarms
get_cloudwatch_logs
get_cloudwatch_alarm_summary
get_recent_log_errors
list_log_groups
get_ecs_service_health
list_ecs_tasks
get_recent_stopped_ecs_tasks
get_rds_instance_health
get_rds_metrics
```

**Expected (aggregates pack enabled — 24 tools):** the 21 tools above plus `aws_account_overview`, `aws_cost_overview`, `aws_observability_overview`.

**Must not appear** when disabled: pack-gated tools (for example `aggregates` tools when that pack is off), tools in `AWS_MCP_DISABLED_TOOLS`, or tools outside `AWS_MCP_ENABLED_TOOLS` when that allowlist is set.

- [ ] **7.** Authenticated `tools/list` returns the expected enabled tool set for this deployment

### 8. Every listed tool descriptor has required fields

From the `tools/list` response, confirm each **enabled** tool includes:

- `title`
- `description`
- `inputSchema`
- `annotations` (read-only hints)
- `securitySchemes`
- `_meta.securitySchemes`

- [ ] **8.** All enabled tool descriptors have required ChatGPT-compatible fields

### 9. No tool advertises `noauth`

Confirm no descriptor contains `"type":"noauth"` in `securitySchemes` or `_meta.securitySchemes`. All enabled tools require OAuth `aws:read`.

- [ ] **9.** No tool advertises `noauth`

### 10. `get_gateway_status` succeeds without AWS calls

Invoke `get_gateway_status` via authenticated `tools/call` or through ChatGPT after linking.

**Expected:** Success; response reports read-only gateway mode without exposing credentials, tokens, or secrets.

- [ ] **10.** `get_gateway_status` succeeds (no AWS dependency)

### 11. `search` returns catalog results

Invoke `search` with a keyword (for example `ec2` or `cost`).

**Expected:** Catalog document ids with `tool/` prefix; no AWS API calls.

- [ ] **11.** `search` returns catalog results

### 12. `fetch` returns a selected catalog document

Invoke `fetch` with one id from step 11 (for example `tool/list_ec2_instances`).

**Expected:** Tool document with inputs and read-only behavior; no live AWS data.

- [ ] **12.** `fetch` returns a catalog document

### 13. A bounded AWS read-only tool succeeds or returns a normalized public error

Call one bounded read-only tool (preferred: `list_ec2_instances` in a single allowed region from `AWS_ALLOWED_REGIONS`).

**Expected:** Normalized read-only inventory or a public `validation_error`, `configuration_error`, or `aws_request_failed` — never raw AWS JSON or credentials.

- [ ] **13.** Bounded AWS read-only tool behaves correctly

### 14. ChatGPT Connector Server URL is `https://<worker-host>/mcp`

In ChatGPT → **Settings → Apps → Create** (or edit):

```text
Server URL: https://<worker-host>/mcp
Authentication: OAuth
OAuth provider/client: configured external provider such as Auth0
Required scope: aws:read
```

Do **not** set `MCP_RESOURCE_URL` or `OAUTH_AUDIENCE` to `https://<worker-host>/mcp`.

- [ ] **14.** ChatGPT Server URL includes `/mcp`; OAuth resource vars use origin only

### 15. OAuth linking succeeds in ChatGPT

Complete the OAuth flow in ChatGPT (Auth0 or compatible OIDC user — not ChatGPT account credentials).

**Expected:** OAuth callback completes without redirect URI errors.

- [ ] **15.** OAuth linking succeeds

### 16. ChatGPT Actions list the enabled tools

After OAuth linking, open the connector and click **Refresh** if updating after a deploy.

**Expected:** The Actions page lists all **enabled** MCP tools from step 7 — not “No app actions available yet”. Default deployments show 21 Actions; aggregates-enabled deployments show 24.

- [ ] **16.** ChatGPT Actions match the enabled tool set from `tools/list`

### 17. A real ChatGPT prompt can call `get_gateway_status`

Ask ChatGPT to check gateway status through the connector.

**Expected:** Tool succeeds; validates OAuth and MCP execution without AWS.

- [ ] **17.** ChatGPT prompt invokes `get_gateway_status`

### 18. A bounded real ChatGPT prompt can call one AWS read-only tool

Ask ChatGPT for a bounded read-only query (for example EC2 instances in one allowed region).

**Expected:** Normalized read-only response or a clear public error.

- [ ] **18.** ChatGPT prompt invokes a bounded AWS read-only tool

### 19. (Optional) Aggregate overview tools when `aggregates` pack is enabled

Skip unless `AWS_MCP_ENABLED_TOOL_PACKS` includes `aggregates`.

- [ ] **19a.** `tools/list` includes `aws_account_overview`, `aws_cost_overview`, and `aws_observability_overview`
- [ ] **19b.** One aggregate tool returns normalized bounded output or a safe public error

---

## OAuth success with empty Actions — fallback diagnosis

If OAuth succeeds but Actions are empty, **verify authenticated `tools/list` (steps 7–9) before changing OAuth provider settings**. Common causes:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| OAuth OK, no Actions | Empty `tools/list`, invalid descriptors, stale connector cache, wrong deploy | Re-run steps 7–9; refresh or recreate connector |
| Fewer Actions than expected | Restricted tool packs or denylist | Review `AWS_MCP_ENABLED_TOOL_PACKS` and `AWS_MCP_DISABLED_TOOLS` |
| Server URL wrong | Missing `/mcp` in ChatGPT | Use `https://<worker-host>/mcp` |
| Metadata wrong | `MCP_RESOURCE_URL` includes `/mcp` | Use Worker origin only |

Full troubleshooting: [chatgpt-connector-smoke-test.md#troubleshooting](chatgpt-connector-smoke-test.md#troubleshooting).

---

## Final safety checks

Confirm before marking production-ready:

- [ ] No write-capable AWS tools exist in the public tool registry
- [ ] No generic AWS API proxy exists (`call_any_aws_api` or equivalent)
- [ ] No generic AWS CLI execution tool exists (`run_aws_cli` or equivalent)
- [ ] No AWS credentials appear in docs, tests, snapshots, logs, or descriptor outputs
- [ ] No OAuth access tokens appear in docs, tests, snapshots, logs, or descriptor outputs
- [ ] Public docs and tracked config use placeholders only — no live account IDs, ARNs, worker URLs, or secrets
- [ ] AWS tools remain region-bounded and read-only (see [mcp-tools.md](mcp-tools.md) and `descriptor-contract.test.ts`)

---

## When production-ready

All required checklist items pass for your exposure configuration, final safety checks are confirmed, and the deployed Worker matches the commit that passed `pnpm run verify:connector-contract`. For detailed expected HTTP responses and ChatGPT UI walkthrough, see [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).
