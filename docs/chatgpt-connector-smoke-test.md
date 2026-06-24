# ChatGPT connector smoke validation runbook

Manual end-to-end validation for a deployed AWS MCP Gateway used as a **ChatGPT custom app connector** with `AUTH_MODE=oauth`.

**Start with the production acceptance gate:** [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) (full pre-PR validation from [README.md](../README.md#testing), then the deployed and ChatGPT checklist). This runbook provides detailed expected responses for each HTTP and UI step.

**Related documentation:**

- [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md) — Auth0 OAuth setup
- [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) — production acceptance checklist (start here)
- [chatgpt-connector.md](chatgpt-connector.md) — connector overview and discovery model
- [mcp-testing.md](mcp-testing.md) — curl smoke tests (local bearer mode and failure modes)

**Automated pre-checks (optional):** [`scripts/verify-oauth-deployment.sh`](../scripts/verify-oauth-deployment.sh) validates protected resource metadata and the unauthenticated `/mcp` OAuth challenge over HTTP. It does **not** replace ChatGPT UI validation.

Replace `<worker-host>` with your deployed Worker hostname (for example `aws-mcp-gateway.example.workers.dev`). Do not paste real OAuth access tokens, AWS keys, Auth0 client secrets, account IDs, or private callback identifiers into issues, docs, or terminal history.

## URL model

Before running smoke checks, confirm this split:

```text
ChatGPT Connector Server URL: https://<worker-host>/mcp
MCP_RESOURCE_URL and OAUTH_AUDIENCE: https://<worker-host> (origin only — do not append /mcp)
Protected resource metadata: https://<worker-host>/.well-known/oauth-protected-resource
```

`pnpm run verify:oauth` prints the ChatGPT Connector Server URL and validates deployed metadata.

---

## Prerequisites

- Worker deployed with `AUTH_MODE=oauth` and OAuth vars configured (see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md)).
- AWS secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) configured in Cloudflare.
- Auth0 (or compatible OIDC) application with ChatGPT redirect URI and `aws:read` scope grant.
- ChatGPT account with permission to create custom app connectors.

---

## Step 1 — Verify Worker health

```bash
curl https://<worker-host>/health
```

**Expected:**

- HTTP `200`
- Body: `{ "ok": true, "service": "aws-mcp-gateway" }`

`/health` is public and must not expose credentials, tokens, or AWS configuration.

---

## Step 2 — Verify protected resource metadata

```bash
curl https://<worker-host>/.well-known/oauth-protected-resource
```

**Expected:**

- HTTP `200`
- JSON includes:
  - `resource` — Worker URL (for example `https://<worker-host>`)
  - `authorization_servers` — array with your OIDC issuer URL
  - `scopes_supported` — includes `aws:read`
  - `resource_documentation` — link to this repository

This route works without AWS credentials. It must not expose JWT claims, JWKS material, or provider error bodies.

---

## Step 3 — Verify unauthenticated `/mcp` returns OAuth challenge

```bash
curl -i -X POST https://<worker-host>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Expected:**

- HTTP `401`
- `WWW-Authenticate` header contains:
  - `Bearer`
  - `resource_metadata=` (pointing at `/.well-known/oauth-protected-resource`)
  - `scope=` (includes `aws:read`)
  - `error="invalid_token"`
- JSON body uses normalized `unauthorized` error — not raw stack traces or binding names.

Unauthenticated requests must never reach MCP tool execution.

---

## Step 4 — Validate authenticated `tools/list`

Before relying on the ChatGPT Actions UI, confirm the deployed gateway returns all **enabled** tools with valid descriptors.

Obtain an OAuth access token through the ChatGPT connector flow (or your OIDC provider's token endpoint for staging). Do **not** paste tokens into docs, issues, or terminal history.

```bash
curl -X POST https://<worker-host>/mcp \
  -H "Authorization: Bearer <oauth-access-token>" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Example JSON-RPC payload (no token required in the body):

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

**Expected:**

- HTTP `200`
- `result.tools` includes all **enabled** tools for this deployment (21 with default packs; 24 when `aggregates` is enabled). Default exposure lists:
  - `search`
  - `fetch`
  - `get_gateway_status`
  - `get_aws_cost_summary`
  - `get_aws_cost_by_service`
  - `get_budget_status`
  - `list_ec2_instances`
  - `list_lambda_functions`
  - `list_s3_buckets`
  - `get_ecr_image_status`
  - `compare_ecs_task_image_with_ecr`
  - `get_cloudwatch_alarms`
  - `get_cloudwatch_logs`
  - `get_cloudwatch_alarm_summary`
  - `get_recent_log_errors`
  - `list_log_groups`
  - `get_ecs_service_health`
  - `list_ecs_tasks`
  - `get_recent_stopped_ecs_tasks`
  - `get_rds_instance_health`
  - `get_rds_metrics`
- Each tool descriptor includes `name`, `title`, `description`, `inputSchema`, OAuth `securitySchemes`, and read-only annotations.

If `tools/list` is empty or descriptors are missing required fields, OAuth may still succeed while ChatGPT shows **“No app actions available yet”**. Fix descriptors and redeploy before troubleshooting in the ChatGPT UI.

For local `AUTH_MODE=local-bearer` smoke tests, replace the bearer token with `MCP_AUTH_TOKEN`. See [mcp-testing.md](mcp-testing.md).

---

## Step 5 — Create or refresh the ChatGPT custom app connector

1. In ChatGPT → **Settings → Apps → Create** (or edit an existing connector).
2. Set **Server URL** to `https://<worker-host>/mcp`.
3. Set **Authentication** to **OAuth**.
4. If updating an existing connector after a gateway deploy, click **Refresh** so ChatGPT reloads `tools/list`.

Full Auth0 setup: [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

---

## Step 6 — Complete OAuth login in ChatGPT

1. Start the connector OAuth flow in ChatGPT.
2. Log in with your Auth0 (or OIDC) user — not your ChatGPT account credentials.
3. Approve access if prompted.

**Expected:** OAuth callback completes without redirect URI errors.

---

## Step 7 — Confirm ChatGPT Actions are visible

After OAuth succeeds, open the connector and confirm **Actions** lists AWS tools.

**Expected:** Tools such as `search`, `fetch`, `get_gateway_status`, and AWS read-only tools appear. You should **not** see “No app actions available yet” if the deployed gateway returns valid OAuth-backed `tools/list` descriptors for all enabled tools.

If Actions are empty but Step 4 passed, refresh the connector (Step 5) and verify ChatGPT is not serving a stale connector cache.

---

## Step 8 — Call `get_gateway_status` (first live connector call)

Ask ChatGPT to check gateway status, or invoke `get_gateway_status` through the connector.

**Expected:**

- Tool succeeds without calling AWS.
- Response reports gateway mode (read-only) and does not expose AWS credentials, bearer tokens, or secrets.

Use this as the **first** live connector call because it validates OAuth and MCP execution without depending on AWS IAM or regional inventory.

---

## Step 9 — Use `search` for an AWS capability

Ask ChatGPT to find a tool, for example: “search for EC2 instances” or “find cost tools.”

**Expected:**

- `search` returns catalog document ids with the `tool/` prefix (for example `tool/list_ec2_instances`).
- No AWS API calls occur during search.

---

## Step 10 — Use `fetch` for one returned catalog id

Ask ChatGPT to fetch details for one id from Step 9 (for example `tool/list_ec2_instances`).

**Expected:**

- `fetch` returns a document describing the tool, its inputs, and read-only behavior.
- No live AWS data in the fetch response.

---

## Step 11 — Call one bounded read-only AWS tool

Ask ChatGPT to list EC2 instances in **one allowed region** from your `AWS_ALLOWED_REGIONS` configuration.

**Preferred smoke tool:** `list_ec2_instances` with a single region (for example `us-east-1`).

**Expected:**

- Tool returns normalized read-only EC2 inventory or an empty list.
- Response does not include raw AWS JSON or credentials.

Do **not** use CloudWatch Logs as the first AWS smoke test — log groups are account-specific and more likely to produce false negatives.

---

## Step 12 — Verify safe failure behavior

Confirm failures are normalized and do not leak secrets:

| Scenario | How to trigger | Expected |
|----------|----------------|----------|
| Missing scope | Auth0 client without `aws:read` grant | `forbidden` or `unauthorized`; no AWS data |
| Disallowed region | Request a region outside `AWS_ALLOWED_REGIONS` | `validation_error` before AWS call |
| Invalid AWS config | Temporarily misconfigure secrets (staging only) | `configuration_error` or `aws_error` — no raw AWS bodies or keys |

Never paste OAuth access tokens into troubleshooting notes or GitHub issues.

---

## Troubleshooting

| Symptom | Likely cause | Required fix |
|---------|--------------|--------------|
| OAuth callback fails | Redirect URI mismatch | Copy the exact ChatGPT callback URI into Auth0 and rerun setup |
| OAuth succeeds but no actions are visible | `tools/list` empty, invalid descriptors, stale connector cache, or wrong deployed commit | Run `/mcp` `tools/list` check, refresh/recreate connector, verify deploy |
| OAuth works but tool calls fail unauthorized | Missing/invalid access token | Re-link connector and verify OAuth challenge metadata |
| Tool calls fail forbidden | Token lacks `aws:read` | Fix Auth0 API/client scope grant |
| ChatGPT connector setup fails | Server URL does not include `/mcp` | Use `https://<worker-host>/mcp` in ChatGPT |
| Metadata discovery fails | `MCP_RESOURCE_URL` incorrectly includes `/mcp` | Use origin only for `MCP_RESOURCE_URL` and `OAUTH_AUDIENCE` |
| AWS tool fails after actions appear | IAM, region allowlist, or AWS secret issue | Verify AWS config and use `get_gateway_status` first |
| ChatGPT sees old tool descriptors | Cached connector metadata | Refresh connector after deployment |

---

## Security reminders

- Do not paste OAuth access tokens, AWS keys, Cloudflare API tokens, or Auth0 client secrets into docs, issues, or screenshots.
- `/mcp` must never accept unauthenticated requests.
- This gateway is read-only — no write or management AWS tools in the current read-only scope.
- Do not widen IAM permissions for smoke testing.
