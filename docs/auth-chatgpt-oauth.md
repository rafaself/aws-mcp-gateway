# ChatGPT OAuth connector setup

This guide walks through connecting the deployed AWS MCP Gateway to ChatGPT using the **OAuth** authentication option with an Auth0-compatible identity provider.

For the authorization contract and security model, see [docs/specs/oauth-chatgpt-connector.md](specs/oauth-chatgpt-connector.md).

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

Set these non-secret vars in `wrangler.jsonc` `[vars]` or via the Cloudflare dashboard:

```text
AUTH_MODE=oauth
MCP_RESOURCE_URL=https://<worker-host>
OAUTH_ISSUER=https://<auth0-domain>/
OAUTH_AUDIENCE=https://<worker-host>
OAUTH_JWKS_URI=https://<auth0-domain>/.well-known/jwks.json
OAUTH_REQUIRED_SCOPES=aws:read
```

Do **not** set `MCP_AUTH_TOKEN` in OAuth mode.

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

From ChatGPT, verify `tools/list` and `get_gateway_status` succeed. Use ChatGPT for tool verification — do not paste OAuth access tokens into docs or terminal history.

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
