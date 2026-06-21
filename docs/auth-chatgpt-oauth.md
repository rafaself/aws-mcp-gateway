# ChatGPT OAuth connector setup

This guide walks through connecting the deployed AWS MCP Gateway to ChatGPT using the **OAuth** authentication option with an Auth0-compatible identity provider.

For the authorization contract and security model, see [docs/specs/oauth-chatgpt-connector.md](specs/oauth-chatgpt-connector.md). For client identification modes (predefined client vs future CIMD), see [docs/specs/oauth-client-identification.md](specs/oauth-client-identification.md).

## Prerequisites

- A deployed Worker (see [deployment.md](deployment.md))
- An Auth0 account (or compatible OIDC provider)
- AWS IAM credentials configured as Cloudflare secrets (separate from OAuth)

## Security notes

- **No auth is not acceptable** for production deployments that expose AWS account data. Use OAuth (or legacy bearer for local-only testing).
- OAuth tokens must not be pasted into GitHub issues, PRs, docs, screenshots, or chat logs.
- AWS credentials remain Cloudflare secrets and are unrelated to OAuth user tokens.
- OAuth protects who may call the gateway; IAM still limits what the gateway can read from AWS.
- OAuth does not permit write tools or generic AWS API access.

## Setup steps

### 1. Create an Auth0 API (resource)

In the Auth0 dashboard, create an API representing the MCP resource.

- Set the **API audience** to the same value you will use for `MCP_RESOURCE_URL` and `OAUTH_AUDIENCE` (your Worker URL, e.g. `https://aws-mcp-gateway.<subdomain>.workers.dev`).

### 2. Add the `aws:read` scope

On the API, add a permission/scope:

```text
aws:read
```

### 3. Create an Auth0 application for ChatGPT

Create a regular web application (or native/public client per your Auth0 tenant policy) for the ChatGPT connector.

### 4. Configure the ChatGPT redirect URI

In the Auth0 application settings, add the redirect URI shown in the ChatGPT connector setup screen:

```text
https://chatgpt.com/connector/oauth/{callback_id}
```

Replace `{callback_id}` with the value from ChatGPT when you create the connector.

### 5. Configure Worker OAuth vars

Copy [`wrangler.example.jsonc`](../wrangler.example.jsonc) for a portable template, or set these non-secret vars in `wrangler.jsonc` `[vars]` or via the Cloudflare dashboard:

```text
AUTH_MODE=oauth
MCP_RESOURCE_URL=https://<worker-host>
OAUTH_ISSUER=https://<auth0-domain>/
OAUTH_AUDIENCE=https://<worker-host>
OAUTH_JWKS_URI=https://<auth0-domain>/.well-known/jwks.json
OAUTH_REQUIRED_SCOPES=aws:read
```

Do **not** set `MCP_AUTH_TOKEN` in OAuth mode.

To create the Auth0 API, `aws:read` scope, and ChatGPT application automatically, add Management API credentials to `.env.deploy.local` (see `.env.deploy.example`) and run:

```bash
pnpm run setup:auth0
```

After creating the ChatGPT connector, set `AWS_MCP_GATEWAY_CHATGPT_REDIRECT_URI` in `.env.deploy.local` and run `pnpm run setup:auth0` again to update the callback URL.

### 6. Configure AWS secrets separately

```bash
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

Or use `pnpm run sync-secrets` with `AUTH_MODE=oauth` in `.env.deploy.local` (see [deployment.md](deployment.md)).

### 7. Deploy

```bash
pnpm deploy
```

### 8. Verify protected-resource metadata

```bash
pnpm run verify:oauth
# or manually:
curl https://<worker-host>/.well-known/oauth-protected-resource
```

Expected: `200` with `resource`, `authorization_servers`, and `scopes_supported` including `aws:read`.

### 9. Create the ChatGPT app connector

In ChatGPT, create a custom app with:

```text
Connection: Server URL
Server URL: https://<worker-host>/mcp
Authentication: OAuth
```

Complete the OAuth flow in the ChatGPT UI. Do not copy access tokens manually.

### 10. Confirm tools work

From ChatGPT:

1. Open the connector and click **Refresh** so ChatGPT reloads `tools/list`.
2. Confirm **Actions** lists AWS tools (not “No app actions available yet”).
3. Verify `get_gateway_status` or ask ChatGPT to search for a tool (for example “EC2 instances”).

The gateway exposes `search` and `fetch` for ChatGPT connector discovery, plus six read-only AWS tools. See [chatgpt-connector.md](chatgpt-connector.md).

Do not paste OAuth access tokens into docs or terminal history.

## OAuth linking model

ChatGPT connects to this gateway as an OAuth **resource server**. Authorization discovery uses:

- `GET /.well-known/oauth-protected-resource` — public metadata with issuer and `aws:read` scope
- `WWW-Authenticate` on unauthenticated `POST /mcp` — directs ChatGPT to the metadata URL and required scope

Authentication happens **before** MCP server creation. Invalid or insufficient-scope tokens never reach tool handlers.

After OAuth setup, run the end-to-end smoke runbook: [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).

Regression tests for these contracts live in `src/index.oauth.test.ts` and `src/auth/oauth/`.

## Client identification mode

- **Currently supported:** predefined OAuth client in Auth0 (or compatible OIDC provider). See setup steps below and [oauth-client-identification.md](specs/oauth-client-identification.md).
- **Future compatibility:** CIMD-compatible client identification at the authorization server when the provider supports it. The Worker validation path does not change unless token claims change.
- **Not supported in this gateway:** custom DCR or OAuth authorization server implementation inside the Worker.

If the ChatGPT connector works with the current Auth0 predefined client flow, no CIMD migration is needed for MVP. Do not attempt to implement DCR or OAuth server behavior in this repository.

## Full connector guide

See [chatgpt-connector.md](chatgpt-connector.md) for discovery flow, tool surface, troubleshooting, and curl smoke tests.

## Local development (legacy bearer)

For local `pnpm dev`, use legacy bearer mode:

```text
AUTH_MODE=legacy-bearer
MCP_AUTH_TOKEN=<local-only-token>
```

See [mcp-testing.md](mcp-testing.md) for curl examples.

## References

- [OpenAI Apps SDK authentication guide](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI connect from ChatGPT guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [OpenAI Apps SDK testing guide](https://developers.openai.com/apps-sdk/deploy/testing)
