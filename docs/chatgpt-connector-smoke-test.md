# ChatGPT connector smoke validation runbook

Manual end-to-end validation for a deployed AWS MCP Gateway used as a **ChatGPT custom app connector** with `AUTH_MODE=oauth`.

This runbook proves the full path from HTTP health checks through OAuth login, tool discovery, and bounded read-only AWS tool invocation inside the real ChatGPT connector UI.

**Related documentation:**

- [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md) — Auth0 OAuth setup
- [chatgpt-connector.md](chatgpt-connector.md) — connector overview and discovery model
- [mcp-testing.md](mcp-testing.md) — curl smoke tests (legacy bearer and failure modes)

**Automated pre-checks (optional):** [`scripts/verify-oauth-deployment.sh`](../scripts/verify-oauth-deployment.sh) validates protected resource metadata and the unauthenticated `/mcp` OAuth challenge over HTTP. It does **not** replace ChatGPT UI validation.

Replace `<worker-host>` with your deployed Worker hostname (for example `aws-mcp-gateway.example.workers.dev`). Do not paste real OAuth access tokens, AWS keys, Auth0 client secrets, account IDs, or private callback identifiers into issues, docs, or terminal history.

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

## Step 4 — Create or refresh the ChatGPT custom app connector

1. In ChatGPT → **Settings → Apps → Create** (or edit an existing connector).
2. Set **Server URL** to `https://<worker-host>/mcp`.
3. Set **Authentication** to **OAuth**.
4. If updating an existing connector after a gateway deploy, click **Refresh** so ChatGPT reloads `tools/list`.

Full Auth0 setup: [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md).

---

## Step 5 — Complete OAuth login in ChatGPT

1. Start the connector OAuth flow in ChatGPT.
2. Log in with your Auth0 (or OIDC) user — not your ChatGPT account credentials.
3. Approve access if prompted.

**Expected:** OAuth callback completes without redirect URI errors.

---

## Step 6 — Confirm ChatGPT Actions are visible

After OAuth succeeds, open the connector and confirm **Actions** lists AWS tools.

**Expected:** Tools such as `search`, `fetch`, `get_gateway_status`, and AWS read-only tools appear. You should **not** see “No app actions available yet” if the deployed gateway returns valid OAuth-backed `tools/list` descriptors for all public tools.

If Actions are empty, refresh the connector (Step 4) and verify the deployed commit includes valid tool descriptors (titles, schemas, annotations, and OAuth `securitySchemes` on every public tool).

---

## Step 7 — Call `get_gateway_status` (first live connector call)

Ask ChatGPT to check gateway status, or invoke `get_gateway_status` through the connector.

**Expected:**

- Tool succeeds without calling AWS.
- Response reports gateway mode (read-only) and does not expose AWS credentials, bearer tokens, or secrets.

Use this as the **first** live connector call because it validates OAuth and MCP execution without depending on AWS IAM or regional inventory.

---

## Step 8 — Use `search` for an AWS capability

Ask ChatGPT to find a tool, for example: “search for EC2 instances” or “find cost tools.”

**Expected:**

- `search` returns catalog document ids with the `tool/` prefix (for example `tool/list_ec2_instances`).
- No AWS API calls occur during search.

---

## Step 9 — Use `fetch` for one returned catalog id

Ask ChatGPT to fetch details for one id from Step 8 (for example `tool/list_ec2_instances`).

**Expected:**

- `fetch` returns a document describing the tool, its inputs, and read-only behavior.
- No live AWS data in the fetch response.

---

## Step 10 — Call one bounded read-only AWS tool

Ask ChatGPT to list EC2 instances in **one allowed region** from your `AWS_ALLOWED_REGIONS` configuration.

**Preferred smoke tool:** `list_ec2_instances` with a single region (for example `us-east-1`).

**Expected:**

- Tool returns normalized read-only EC2 inventory or an empty list.
- Response does not include raw AWS JSON or credentials.

Do **not** use CloudWatch Logs as the first AWS smoke test — log groups are account-specific and more likely to produce false negatives.

---

## Step 11 — Verify safe failure behavior

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
| OAuth succeeds but Actions are empty | Stale connector or missing `search`/`fetch` in `tools/list` | Refresh connector; verify deployed commit includes discovery tools |
| Tools return `unauthorized` | Missing `aws:read` scope | Fix Auth0 API/client scope grant |
| Tools return `forbidden` | Token valid but insufficient scope | Ensure access token includes every configured required scope |
| AWS tools fail after connector works | IAM or AWS vars issue | Verify AWS secrets, IAM policy, and `AWS_ALLOWED_REGIONS` |
| ChatGPT sees old tool descriptors | Cached connector metadata | Refresh connector after deployment |

---

## Security reminders

- Do not paste OAuth access tokens, AWS keys, Cloudflare API tokens, or Auth0 client secrets into docs, issues, or screenshots.
- `/mcp` must never accept unauthenticated requests.
- This gateway is read-only — no write or management AWS tools in the MVP.
- Do not widen IAM permissions for smoke testing.
