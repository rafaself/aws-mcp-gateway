# ChatGPT Connector production acceptance

Final production gate proving the deployed Worker is ready for integration as a **ChatGPT Connector App**. This checklist validates repository safety, deployment health, MCP transport behavior, tool descriptors, read-only actions, and ChatGPT UI acceptance.

**Prerequisites (connector hardening set):** [#87](https://github.com/rafaondjango/aws-mcp-gateway/issues/87), [#88](https://github.com/rafaondjango/aws-mcp-gateway/issues/88), [#89](https://github.com/rafaondjango/aws-mcp-gateway/issues/89), [#90](https://github.com/rafaondjango/aws-mcp-gateway/issues/90), [#91](https://github.com/rafaondjango/aws-mcp-gateway/issues/91), [#92](https://github.com/rafaondjango/aws-mcp-gateway/issues/92).

**Related documentation:**

- [chatgpt-connector.md](chatgpt-connector.md) — connector contract and architecture
- [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md) — detailed step-by-step runbook with expected responses
- [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md) — Auth0 OAuth setup
- [dependency-upgrade-contract.md](dependency-upgrade-contract.md) — runtime dependency pin contract

Replace `<worker-host>` with your deployed Worker hostname. Do not paste real OAuth access tokens, AWS keys, or Auth0 client secrets into docs, issues, or terminal history.

## URL model

Confirm this split before any deployed or ChatGPT checks:

```text
ChatGPT Connector Server URL: https://<worker-host>/mcp
MCP_RESOURCE_URL and OAUTH_AUDIENCE: https://<worker-host> (origin only — do not append /mcp)
Protected resource metadata: https://<worker-host>/.well-known/oauth-protected-resource
Required scope: aws:read
Expected public MCP tools: 8
```

---

## Production acceptance checklist

### 1. Repository validation passes locally

```bash
pnpm run verify:connector-contract
```

This runs `typecheck`, the full test suite (including connector contract tests), and `test:integrity`. No live ChatGPT, Auth0, Cloudflare, or AWS calls are required.

| Contract surface | Guarded by |
|------------------|------------|
| Pinned runtime dependencies | `src/test/dependency-contract.test.ts` |
| OAuth URL origin (no `/mcp` on resource/audience) | `src/config/oauth-urls.test.ts` |
| Public descriptor shape, OAuth security, no `noauth` | `src/mcp/tools/descriptor-contract.test.ts` |
| HTTP `tools/list` returns 8 public tools | `src/mcp/tools/list-integration.test.ts` |
| `/mcp` 401 challenge and protected-resource metadata | `src/index.oauth.test.ts` |

- [ ] **1.** `pnpm run verify:connector-contract` passes

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

### 7. Authenticated `tools/list` returns exactly 8 public tools

```bash
curl -sS -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Expected:** `result.tools` includes exactly: `search`, `fetch`, `get_gateway_status`, `get_aws_cost_summary`, `get_aws_cost_by_service`, `list_ec2_instances`, `get_cloudwatch_alarms`, `get_recent_log_errors`.

- [ ] **7.** Authenticated `tools/list` returns 8 public tools

### 8. Every public tool descriptor has required fields

From the `tools/list` response, confirm each of the 8 tools includes:

- `title`
- `description`
- `inputSchema`
- `annotations` (read-only hints)
- `securitySchemes`
- `_meta.securitySchemes`

- [ ] **8.** All descriptors have required ChatGPT-compatible fields

### 9. No tool advertises `noauth`

Confirm no descriptor contains `"type":"noauth"` in `securitySchemes` or `_meta.securitySchemes`. All public tools require OAuth `aws:read`.

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

**Expected:** Normalized read-only inventory or a public `validation_error`, `configuration_error`, or `aws_error` — never raw AWS JSON or credentials.

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

### 16. ChatGPT Actions list the public tools

After OAuth linking, open the connector and click **Refresh** if updating after a deploy.

**Expected:** The Actions page lists all 8 public MCP tools — not “No app actions available yet”.

- [ ] **16.** ChatGPT Actions list 8 public tools

### 17. A real ChatGPT prompt can call `get_gateway_status`

Ask ChatGPT to check gateway status through the connector.

**Expected:** Tool succeeds; validates OAuth and MCP execution without AWS.

- [ ] **17.** ChatGPT prompt invokes `get_gateway_status`

### 18. A bounded real ChatGPT prompt can call one AWS read-only tool

Ask ChatGPT for a bounded read-only query (for example EC2 instances in one allowed region).

**Expected:** Normalized read-only response or a clear public error.

- [ ] **18.** ChatGPT prompt invokes a bounded AWS read-only tool

---

## OAuth success with empty Actions — fallback diagnosis

If OAuth succeeds but Actions are empty, **verify authenticated `tools/list` (steps 7–9) before changing OAuth provider settings**. Common causes:

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| OAuth OK, no Actions | Empty `tools/list`, invalid descriptors, stale connector cache, wrong deploy | Re-run steps 7–9; refresh or recreate connector |
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
- [ ] AWS tools remain region-bounded and read-only (see [mcp-tools.md](mcp-tools.md) and `descriptor-contract.test.ts`)

---

## When production-ready

All 18 checklist items pass, final safety checks are confirmed, and the deployed Worker matches the commit that passed `pnpm run verify:connector-contract`. For detailed expected HTTP responses and ChatGPT UI walkthrough, see [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).
