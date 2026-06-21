# ChatGPT connector integration

This gateway is designed for use as a **ChatGPT custom app connector**. ChatGPT discovers AWS read-only tools through the OpenAI MCP `search` and `fetch` tools, then calls the underlying MCP tools (`get_aws_cost_summary`, `list_ec2_instances`, and others) after OAuth authentication.

For OAuth setup with Auth0, see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md). For authorization contract details, see [specs/oauth-chatgpt-connector.md](specs/oauth-chatgpt-connector.md).

## What ChatGPT expects

ChatGPT connectors require:

| Requirement | Gateway behavior |
|-------------|------------------|
| HTTPS MCP endpoint | `https://<worker-host>/mcp` |
| OAuth authentication | `AUTH_MODE=oauth` with Auth0 (or compatible OIDC) |
| `search` tool | Catalog search over read-only AWS MCP tools |
| `fetch` tool | Full tool document for a `search` result id |
| Tool discovery in Actions UI | `search` advertises `noauth` + `oauth2`; AWS tools use `oauth2` only |

Without `search` and `fetch`, OAuth may succeed but ChatGPT shows **“No app actions available yet”** because the connector cannot discover tools.

## OAuth linking and discovery

ChatGPT discovers how to authorize against this gateway through two public HTTP surfaces:

1. **Protected resource metadata** — `GET /.well-known/oauth-protected-resource` (OAuth mode only) returns `resource`, `authorization_servers`, `scopes_supported`, and `resource_documentation`.
2. **HTTP `WWW-Authenticate` challenge** — unauthenticated `POST /mcp` returns `401` with a `Bearer` challenge containing `resource_metadata`, `scope`, and `error="invalid_token"`.

The gateway **authenticates before MCP server creation**. Unauthenticated, invalid-token, and insufficient-scope requests never reach tool execution.

Tool descriptors advertise OAuth security metadata (`securitySchemes`, `_meta.securitySchemes`, read-only annotations). Tool-level `_meta["mcp/www_authenticate"]` is **not** used for unauthenticated `/mcp` requests because those requests never reach tools. If a future ChatGPT behavior requires tool-result OAuth metadata, that must be implemented only after a failing real connector smoke test proves the HTTP challenge path is insufficient.

Contract regression tests: `src/index.oauth.test.ts`, `src/auth/oauth/`, `src/mcp/tools/descriptor-contract.test.ts`.

## Connector setup (summary)

1. Deploy the Worker with `AUTH_MODE=oauth` and OAuth vars configured (see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md)).
2. In ChatGPT → **Settings → Apps → Create**, add:
   - **Server URL:** `https://<worker-host>/mcp`
   - **Authentication:** OAuth
3. Complete the OAuth login (Auth0 user, not your ChatGPT account).
4. Open the connector and click **Refresh** after gateway updates so ChatGPT reloads `tools/list`.

## Tool surface

The gateway exposes **8 MCP tools**:

| Tool | Role | AWS calls |
|------|------|-----------|
| `search` | ChatGPT discovery — find AWS tools by keyword | No |
| `fetch` | ChatGPT discovery — tool details and invocation hints | No |
| `get_gateway_status` | Health check | No |
| `get_aws_cost_summary` | Total AWS spend | Yes |
| `get_aws_cost_by_service` | Spend by service | Yes |
| `list_ec2_instances` | EC2 inventory | Yes |
| `get_cloudwatch_alarms` | Alarm states | Yes |
| `get_recent_log_errors` | Recent log errors | Yes |

`search` and `fetch` are **catalog helpers**. They do not call AWS directly. After discovery, ChatGPT invokes the named AWS tools with OAuth (`aws:read` scope).

Full input/output contracts: [mcp-tools.md](mcp-tools.md).

## How discovery works

```text
ChatGPT connector
  → tools/list (OAuth)
  → sees search, fetch, and AWS tools
  → search({ query: "ec2 instances" })
  → fetch({ id: "tool/list_ec2_instances" })
  → tools/call list_ec2_instances (OAuth, live AWS data)
```

Catalog document ids use the prefix `tool/` (for example `tool/list_ec2_instances`). Citation URLs point at `${MCP_RESOURCE_URL}/mcp#tool=<tool_name>`.

Implementation: [`src/mcp/chatgpt/catalog.ts`](../src/mcp/chatgpt/catalog.ts), [`src/mcp/tools/search.ts`](../src/mcp/tools/search.ts), [`src/mcp/tools/fetch.ts`](../src/mcp/tools/fetch.ts).

## Verify in ChatGPT

For the full manual validation flow (HTTP pre-checks through OAuth login, Actions, `get_gateway_status`, `search`/`fetch`, and a bounded AWS tool), see [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).

After OAuth succeeds:

1. Confirm **Actions** lists AWS tools (not “No app actions available yet”).
2. Ask ChatGPT to check gateway status — it should call `get_gateway_status` or use `search`/`fetch` first.
3. Ask for a bounded read-only query (for example EC2 instances in an allowed region).

Do not paste OAuth access tokens into issues, docs, or terminal history.

## Verify with curl (legacy bearer)

Local `pnpm dev` uses `AUTH_MODE=legacy-bearer`. You can smoke-test `search` and `fetch` with a bearer token:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"query":"cost"}}}'

curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fetch","arguments":{"id":"tool/get_aws_cost_summary"}}}'
```

Production ChatGPT connectors use OAuth, not `MCP_AUTH_TOKEN`. See [mcp-testing.md](mcp-testing.md).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| OAuth fails / callback error | Redirect URI mismatch | Add ChatGPT callback URL in Auth0; run `pnpm run setup:auth0` |
| OAuth works, no Actions | Missing `search`/`fetch` or stale connector | Deploy latest gateway; **Refresh** connector in ChatGPT |
| Tools fail with `unauthorized` | Token missing `aws:read` | Ensure Auth0 API grants `aws:read` to the ChatGPT application |
| AWS tools return errors | IAM permissions | See [aws-iam-setup.md](aws-iam-setup.md) |

## References

- [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md) — end-to-end ChatGPT connector smoke runbook
- [OpenAI — Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI — Authentication](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI — Testing](https://developers.openai.com/apps-sdk/deploy/testing)
