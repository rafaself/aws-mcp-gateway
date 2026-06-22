# ChatGPT connector integration

This gateway is designed for use as a **ChatGPT custom app connector**. ChatGPT links via OAuth, calls `/mcp`, and discovers public actions through authenticated `tools/list`. The `search` and `fetch` tools are catalog and knowledge helpers — they help ChatGPT inspect the tool catalog but do **not** replace `tools/list` action discovery.

For OAuth setup with Auth0, see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md). For authorization contract details, see [specs/oauth-chatgpt-connector.md](specs/oauth-chatgpt-connector.md). For client identification modes (predefined client vs future CIMD), see [specs/oauth-client-identification.md](specs/oauth-client-identification.md).

**Production acceptance:** Run `pnpm run verify:connector-contract` locally, then `pnpm run verify:oauth`, then `pnpm run verify:oauth:authenticated`, and finally complete [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) before treating a deployment as ChatGPT-ready.

## Final connector contract

Use these values consistently when configuring ChatGPT and Worker OAuth vars:

```text
Server URL in ChatGPT: https://<worker-host>/mcp
OAuth resource/audience: https://<worker-host>
Protected resource metadata: https://<worker-host>/.well-known/oauth-protected-resource
Required scope: aws:read
Expected enabled MCP tools: 11 (default packs) — see [tool exposure](#tool-exposure)
```

Do not set `MCP_RESOURCE_URL` or `OAUTH_AUDIENCE` to `https://<worker-host>/mcp`. The OAuth resource identity is the Worker origin; the MCP transport endpoint is `/mcp`.

## Layered architecture

The gateway is organized as a single MCP runtime with layered responsibilities — not MCP-on-MCP or duplicate runtimes:

```text
Tool manifests (source of truth)
  -> policy gate (packs, cost-control, capabilities)
  -> typed handlers and AWS clients
  -> MCP transport layer at /mcp
  -> ChatGPT-compatible descriptor/catalog adapter
  -> optional future Apps SDK UI layer
```

- **Tool manifests** — each public tool is defined by a `ToolManifest` with pack, AWS capability, cost-control, and descriptor metadata.
- **Policy gate** — `evaluateToolPolicy()` runs before handler execution; disabled packs/tools fail closed with normalized errors.
- **Typed handlers** — explicit read-only handlers with validated inputs and normalized outputs.
- **MCP transport at `/mcp`** — one JSON-RPC endpoint; authentication happens before MCP server creation.
- **ChatGPT-compatible descriptor/catalog adapter** — `tools/list` exposes **enabled** tools only; `search`/`fetch` are catalog helpers.
- **Optional future Apps SDK UI layer** — out of scope for the current read-only scope; would sit above the same MCP contract.

Do not add a second MCP server, proxy another MCP endpoint, or duplicate tool runtimes for ChatGPT compatibility.

## Connector flow

```text
ChatGPT links via OAuth
  -> ChatGPT calls /mcp
  -> ChatGPT discovers public actions through tools/list
  -> search/fetch remain catalog and knowledge helper tools
  -> ChatGPT calls AWS read-only MCP tools directly after discovery
```

OAuth can succeed while actions remain invisible if `tools/list` is empty, returns invalid descriptors, or the connector cache is stale. Always validate authenticated `tools/list` before relying on the ChatGPT Actions UI.

## Action discovery

**Actions appear only if authenticated `tools/list` returns valid descriptors for enabled tools.**

Disabled tools, pack-gated tools, and denylisted tools are **omitted from `tools/list`** and do not appear as ChatGPT Actions. The registry defines 14 public tools; default deployments expose 11.

Each descriptor must include stable `name`, `title`, `description`, `inputSchema`, `outputSchema` (where applicable), read-only `annotations`, and OAuth `securitySchemes`. Without these, ChatGPT shows **“No app actions available yet”** even when OAuth linking succeeds.

`search` and `fetch` help ChatGPT inspect the catalog (keyword search and full tool documents) but **do not replace** `tools/list` action discovery. After discovery, ChatGPT invokes named AWS tools directly with OAuth (`aws:read` scope).

Catalog document ids use the prefix `tool/` (for example `tool/list_ec2_instances`). Citation URLs point at `${MCP_RESOURCE_URL}/mcp#tool=<tool_name>`.

Implementation: [`src/mcp/chatgpt/catalog.ts`](../src/mcp/chatgpt/catalog.ts), [`src/mcp/tools/definitions/search.ts`](../src/mcp/tools/definitions/search.ts), [`src/mcp/tools/definitions/fetch.ts`](../src/mcp/tools/definitions/fetch.ts).

## OAuth linking and discovery

ChatGPT discovers how to authorize against this gateway through two public HTTP surfaces:

1. **Protected resource metadata** — `GET /.well-known/oauth-protected-resource` (OAuth mode only) returns `resource`, `authorization_servers`, `scopes_supported`, and `resource_documentation`.
2. **HTTP `WWW-Authenticate` challenge** — unauthenticated `POST /mcp` returns `401` with a `Bearer` challenge containing `resource_metadata`, `scope`, and `error="invalid_token"`.

The gateway **authenticates before MCP server creation**. Unauthenticated, invalid-token, and insufficient-scope requests never reach tool execution.

OAuth mode also rate-limits `/mcp` requests before the MCP server is created. This keeps abuse control at the HTTP boundary instead of relying on individual AWS-backed tools.

Tool descriptors advertise OAuth security metadata (`securitySchemes`, `_meta.securitySchemes`, read-only annotations). Tool-level `_meta["mcp/www_authenticate"]` is **not** used for unauthenticated `/mcp` requests because those requests never reach tools.

Contract regression tests: `src/index.oauth.test.ts`, `src/auth/oauth/`, `src/mcp/tools/descriptor-contract.test.ts`.

### Dependency stability

Runtime MCP/auth dependency upgrades must be treated as protocol changes until HTTP-level MCP tests prove ChatGPT-compatible discovery still works. The gateway pins transport and auth-critical runtime packages to exact versions; see [dependency-upgrade-contract.md](dependency-upgrade-contract.md) for the upgrade checklist and verification steps.

## Connector setup (summary)

1. Deploy the Worker with `AUTH_MODE=oauth` and OAuth vars configured (see [auth-chatgpt-oauth.md](auth-chatgpt-oauth.md)).
2. In ChatGPT → **Settings → Apps → Create**, add:
   - **Server URL:** `https://<worker-host>/mcp`
   - **Authentication:** OAuth
3. Complete the OAuth login (Auth0 user, not your ChatGPT account).
4. Validate authenticated `tools/list` returns all **enabled** tools for your exposure configuration (11 by default — see [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md)).
5. Open the connector and click **Refresh** after gateway updates so ChatGPT reloads `tools/list`.
6. Confirm **Actions** lists all enabled tools (not “No app actions available yet”).
7. Call `get_gateway_status` before AWS-backed tools.

## Tool exposure

Tool visibility is controlled by environment variables (see [README.md](../README.md#tool-exposure-optional)):

| Pack | Tools | Default |
|------|-------|---------|
| `core` | `search`, `fetch`, `get_gateway_status` | Enabled |
| `cost` | `get_aws_cost_summary`, `get_aws_cost_by_service` | Enabled |
| `inventory` | `list_ec2_instances`, `list_lambda_functions`, `list_s3_buckets` | Enabled |
| `observability` | `get_cloudwatch_alarms`, `get_recent_log_errors`, `list_log_groups` | Enabled |
| `aggregates` | `aws_account_overview`, `aws_cost_overview`, `aws_observability_overview` | **Opt-in** |

Enable aggregates when you want three additional bounded overview Actions:

```text
AWS_MCP_ENABLED_TOOL_PACKS=core,cost,inventory,observability,aggregates
```

## Tool surface

Default deployments expose **11** MCP tools through `tools/list`:

| Tool | Role | Calls AWS | Read-only | Auth | Output shape |
|------|------|-----------|-----------|------|--------------|
| `search` | Catalog search — find AWS tools by keyword | No | Yes | OAuth `aws:read` | [`search` results](mcp-tools.md#search-chatgpt-discovery) |
| `fetch` | Catalog document — tool details and invocation hints | No* | Yes | OAuth `aws:read` | [`fetch` document](mcp-tools.md#fetch-chatgpt-discovery) |
| `get_gateway_status` | Health check — verify MCP execution without AWS | No | Yes | OAuth `aws:read` | [`get_gateway_status`](mcp-tools.md#1-get_gateway_status) |
| `get_aws_cost_summary` | Total AWS spend for a date range | Yes | Yes | OAuth `aws:read` | [`get_aws_cost_summary`](mcp-tools.md#2-get_aws_cost_summary) |
| `get_aws_cost_by_service` | Spend broken down by service | Yes | Yes | OAuth `aws:read` | [`get_aws_cost_by_service`](mcp-tools.md#3-get_aws_cost_by_service) |
| `list_ec2_instances` | EC2 inventory across allowed regions | Yes | Yes | OAuth `aws:read` | [`list_ec2_instances`](mcp-tools.md#4-list_ec2_instances) |
| `get_cloudwatch_alarms` | CloudWatch alarm states | Yes | Yes | OAuth `aws:read` | [`get_cloudwatch_alarms`](mcp-tools.md#5-get_cloudwatch_alarms) |
| `get_recent_log_errors` | Recent error/warning log events | Yes | Yes | OAuth `aws:read` | [`get_recent_log_errors`](mcp-tools.md#6-get_recent_log_errors) |
| `list_lambda_functions` | Lambda functions across allowed regions | Yes | Yes | OAuth `aws:read` | [`list_lambda_functions`](mcp-tools.md#7-list_lambda_functions) |
| `list_s3_buckets` | S3 bucket inventory | Yes | Yes | OAuth `aws:read` | [`list_s3_buckets`](mcp-tools.md#8-list_s3_buckets) |
| `list_log_groups` | CloudWatch log groups in a region | Yes | Yes | OAuth `aws:read` | [`list_log_groups`](mcp-tools.md#9-list_log_groups) |

\* `fetch` does not call AWS except when embedding live `get_gateway_status` JSON for that catalog entry.

`search` and `fetch` are **catalog helpers**. They do not substitute for `tools/list`. After discovery, ChatGPT invokes the named AWS tools with OAuth (`aws:read` scope).

Full input/output contracts: [mcp-tools.md](mcp-tools.md).

## How discovery works in practice

```text
ChatGPT connector
  -> OAuth link
  -> tools/list (OAuth) — Actions UI populated from descriptors
  -> optional: search({ query: "ec2 instances" })
  -> optional: fetch({ id: "tool/list_ec2_instances" })
  -> tools/call list_ec2_instances (OAuth, live AWS data)
```

## Verify in ChatGPT

For the full manual validation flow (HTTP pre-checks through OAuth login, `tools/list`, Actions, `get_gateway_status`, `search`/`fetch`, and a bounded AWS tool), see [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).

After OAuth succeeds:

1. Confirm **Actions** lists all enabled tools from `tools/list` (11 by default).
2. Ask ChatGPT to check gateway status — it should call `get_gateway_status` first.
3. Ask for a bounded read-only query (for example EC2 instances in an allowed region).

Do not paste OAuth access tokens into issues, docs, or terminal history.

## Verify with curl (local bearer mode)

Local `pnpm dev` uses `AUTH_MODE=local-bearer`. You can smoke-test `tools/list`, `search`, and `fetch` with a bearer token:

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search","arguments":{"query":"cost"}}}'

curl -X POST http://localhost:8787/mcp \
  -H "Authorization: Bearer <MCP_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"fetch","arguments":{"id":"tool/get_aws_cost_summary"}}}'
```

Production ChatGPT connectors use OAuth, not `MCP_AUTH_TOKEN`. See [mcp-testing.md](mcp-testing.md).

## Troubleshooting

| Symptom | Likely cause | Required fix |
|---------|--------------|--------------|
| OAuth succeeds but no actions are visible | `tools/list` empty, invalid descriptors, stale connector cache, or wrong deployed commit | Run `/mcp` `tools/list` check, refresh/recreate connector, verify deploy |
| OAuth works but tool calls fail unauthorized | Missing/invalid access token | Re-link connector and verify OAuth challenge metadata |
| Tool calls fail forbidden | Token lacks `aws:read` | Fix Auth0 API/client scope grant |
| ChatGPT connector setup fails | Server URL does not include `/mcp` | Use `https://<worker-host>/mcp` in ChatGPT |
| Metadata discovery fails | `MCP_RESOURCE_URL` incorrectly includes `/mcp` | Use origin only for `MCP_RESOURCE_URL` and `OAUTH_AUDIENCE` |
| AWS tool fails after actions appear | IAM, region allowlist, or AWS secret issue | Verify AWS config and use `get_gateway_status` first |
| OAuth fails / callback error | Redirect URI mismatch | Add ChatGPT callback URL in Auth0; run `pnpm run setup:auth0` |
| ChatGPT sees old descriptors | Cached connector metadata | Refresh connector after deployment |
| Provider rejects ChatGPT client identification | Provider/client registration mismatch | Use predefined client setup first; evaluate CIMD only if provider supports it |
| OAuth works but token audience wrong | Auth0 API audience mismatch | Set API audience equal to `MCP_RESOURCE_URL` and `OAUTH_AUDIENCE` |

## References

- [oauth-client-identification.md](specs/oauth-client-identification.md) — client identification modes (predefined client, future CIMD, unsupported DCR)
- [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) — final production acceptance checklist
- [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md) — end-to-end ChatGPT connector smoke runbook
- [OpenAI — Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI — Authentication](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI — Testing](https://developers.openai.com/apps-sdk/deploy/testing)
