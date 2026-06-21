# Spec: OAuth client identification modes

## Goal

Define how ChatGPT identifies itself to the external authorization server when connecting to the AWS MCP Gateway, without changing the current Auth0 predefined-client MVP path prematurely.

The Worker acts as an **OAuth resource server only**. Client registration and identification belong to the external authorization server and ChatGPT connector — not to this repository.

## Architecture

```text
ChatGPT connector
  -> identifies itself to the external authorization server
  -> external authorization server issues an OAuth access token
  -> ChatGPT calls Worker /mcp with Authorization: Bearer <token>
  -> Worker validates issuer, audience, expiry, signature, and aws:read scope
```

CIMD (Client ID Metadata Document), if used, is handled on the **authorization server / client registration** side. The Worker remains concerned only with protected resource metadata, token validation, and MCP execution.

Related specs:

- [oauth-chatgpt-connector.md](oauth-chatgpt-connector.md) — MVP OAuth resource-server contract
- [auth-chatgpt-oauth.md](../auth-chatgpt-oauth.md) — Auth0 predefined-client setup guide

## Client identification modes

### 1. Current supported mode: predefined OAuth client

**Status:** Production-supported MVP path.

```text
AUTH_MODE=oauth
External provider: Auth0-compatible OIDC provider
Client registration: predefined ChatGPT application/client in the provider
Access token format accepted by Worker: JWT by default; opaque tokens via RFC 7662 introspection are also supported
Required scope: aws:read
```

This is the default recommendation. Use [auth-chatgpt-oauth.md](../auth-chatgpt-oauth.md) and `pnpm run setup:auth0` for Auth0 setup.

The setup script [`scripts/setup-auth0-oauth.sh`](../../scripts/setup-auth0-oauth.sh) intentionally configures **predefined-client only**. It does not implement CIMD automation until provider APIs and ChatGPT flows are verified safe.

### 2. Future preferred mode: CIMD-compatible client identification

**Status:** Post-MVP readiness path — not required for current use.

When an external authorization server supports Client ID Metadata Document (CIMD) or equivalent client identification:

```text
External authorization server supports CIMD-compatible client identification
ChatGPT provides or references client metadata per the provider's supported flow
The authorization server accepts that client identification method
Worker token validation remains unchanged
```

**Worker runtime code should not change** unless the authorization server's resulting tokens require additional validation claims (for example new required JWT fields). Token validation rules remain: JWT signature via JWKS or introspection, issuer, audience/resource, expiry, and `aws:read` scope.

### 3. Explicitly unsupported mode: custom DCR server inside the Worker

**Status:** Out of scope for MVP and hardening phases.

This project will **not** implement:

- A custom OAuth authorization server in the Worker
- Dynamic Client Registration (DCR) endpoints in this repository
- User databases, session stores, token issuance, or OAuth consent UI

## Migration rules

CIMD-related work is allowed only under these constraints:

- Add provider-specific CIMD setup steps **only after** validating the selected provider supports them with the real ChatGPT connector.
- Do **not** remove predefined-client Auth0 setup until CIMD is proven with a real ChatGPT connector smoke test (see [chatgpt-connector-smoke-test.md](../chatgpt-connector-smoke-test.md)).
- Do **not** weaken JWT validation to support CIMD.
- Do **not** accept unsigned tokens or opaque tokens without a separately specified validation strategy such as RFC 7662 introspection.
- Keep `OAUTH_AUDIENCE` equal to `MCP_RESOURCE_URL` unless a new spec explicitly changes the resource model.
- Do **not** add broader scopes than `aws:read` for the MVP read-only gateway.

If the ChatGPT connector works with the current Auth0 predefined client flow, **no CIMD migration is needed** for MVP.

## Security constraints

- Worker remains OAuth resource server only — no token issuance in this repository.
- No OAuth client secrets or Auth0 Management API credentials in Git.
- No `No auth` for AWS account data.
- No write scopes or write-capable AWS tools.

## References

- [RFC 7591 — OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
- [OpenAI Apps SDK authentication guide](https://developers.openai.com/apps-sdk/build/auth)
- [oauth-chatgpt-connector.md](oauth-chatgpt-connector.md)
