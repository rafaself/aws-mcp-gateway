# OAuth authorization contract (ChatGPT connector)

## Goal

This document is the canonical OAuth authorization contract for the AWS MCP Gateway. It describes what the Worker enforces today when connecting to ChatGPT's custom app connector.

Production ChatGPT deployments use `AUTH_MODE=oauth`: the Worker acts as an OAuth resource server, validates JWT access tokens from an external OIDC provider, and requires the `aws:read` scope before executing read-only MCP tools.

Local development uses `AUTH_MODE=local-bearer` with `MCP_AUTH_TOKEN`. ChatGPT's connector UI supports only **OAuth** or **No auth**; unauthenticated `/mcp` is never acceptable for AWS account data.

## Non-goals

- No custom OAuth authorization server in this repository.
- Dynamic Client Registration and Client ID Metadata Documents are not supported in the current production path. For the post-MVP CIMD readiness path, see [oauth-client-identification.md](oauth-client-identification.md).
- Do not remove local bearer support (`AUTH_MODE=local-bearer`).
- Do not allow unauthenticated `/mcp` in any production mode.
- Do not implement a generic OAuth provider, user database, password flow, refresh-token storage, or session store.
- Do not add write-capable AWS permissions or tools.
- Do not change public MCP tool names, inputs, outputs, AWS request semantics, cache semantics, or IAM policy.
- Do not expose AWS credentials, bearer tokens, OAuth access tokens, JWT claims, signed headers, raw AWS responses, or stack traces.

## Architecture

The Worker is an **OAuth resource server only**. An external OIDC/OAuth provider (Auth0 is the documented first provider) issues access tokens; the Worker validates them before any MCP or AWS work runs.

```text
ChatGPT connector
  -> OAuth authorization-code + PKCE with Auth0-compatible provider
  -> receives access token (JWT)
  -> calls Cloudflare Worker /mcp with Authorization: Bearer <oauth_access_token>
  -> Worker validates JWT signature, issuer, audience, expiry, and scope
  -> Worker executes existing read-only MCP tools
```

### Chosen production OAuth mode

Predefined OAuth client in the external identity provider (no Dynamic Client Registration).

```text
Authorization server: external Auth0-compatible OIDC provider
OAuth flow: authorization code + PKCE
Token type accepted by Worker: JWT access token by default; opaque access tokens via RFC 7662 introspection when configured
Token endpoint auth: public client / none, unless provider configuration requires otherwise
Required application scope: aws:read
Worker role: protected resource / resource server
```

## Configuration

### Auth modes

| Variable | Mode | Required | Secret |
|----------|------|----------|--------|
| `AUTH_MODE` | both | yes (defaults to `local-bearer` when absent) | no |
| `MCP_AUTH_TOKEN` | `local-bearer` only | yes | yes (Cloudflare secret) |
| `MCP_RESOURCE_URL` | `oauth` only | yes | no |
| `OAUTH_ISSUER` | `oauth` only | yes | no |
| `OAUTH_AUDIENCE` | `oauth` only | yes | no |
| `OAUTH_TOKEN_VALIDATION_MODE` | `oauth` only | yes (`jwks` default) | no |
| `OAUTH_JWKS_URI` | `oauth` with `jwks` / `hybrid` | yes | no |
| `OAUTH_INTROSPECTION_URL` | `oauth` with `introspection` / `hybrid` | yes | no |
| `OAUTH_INTROSPECTION_CLIENT_ID` | `oauth` with `introspection` / `hybrid` | yes | yes (Cloudflare secret) |
| `OAUTH_INTROSPECTION_CLIENT_SECRET` | `oauth` with `introspection` / `hybrid` | yes | yes (Cloudflare secret) |
| `OAUTH_REQUIRED_SCOPES` | `oauth` only | yes | no |
| `RATE_LIMIT_MAX_REQUESTS` | `oauth` only | yes (defaulted) | no |
| `RATE_LIMIT_WINDOW_SECONDS` | `oauth` only | yes (defaulted) | no |
| `AUTH_RATE_LIMITER` | `oauth` only | yes | binding |

AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) remain Cloudflare secrets in both modes and are unrelated to OAuth user tokens.

### Local bearer mode

```text
AUTH_MODE=local-bearer
MCP_AUTH_TOKEN=<local-only-token>
```

### Production ChatGPT OAuth mode

```text
AUTH_MODE=oauth
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_WINDOW_SECONDS=60
MCP_RESOURCE_URL=https://<worker-host>
OAUTH_ISSUER=https://<auth-provider-domain>/
OAUTH_AUDIENCE=https://<worker-host>
OAUTH_TOKEN_VALIDATION_MODE=jwks
OAUTH_JWKS_URI=https://<auth-provider-domain>/.well-known/jwks.json
OAUTH_REQUIRED_SCOPES=aws:read
```

**Migration rule:** production deployments intended for ChatGPT must use `AUTH_MODE=oauth`.

## Behavior

### Public routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | none | Liveness check |
| `GET /.well-known/oauth-protected-resource` | none | OAuth discovery metadata (oauth mode only) |
| `POST /mcp` | required | MCP endpoint |

OAuth metadata discovery must work even when AWS secrets are missing — it is part of auth setup and does not expose AWS data.

### Protected resource metadata

`GET /.well-known/oauth-protected-resource` returns:

```json
{
  "resource": "https://<worker-host>",
  "authorization_servers": ["https://<auth-provider-domain>/"],
  "scopes_supported": ["aws:read"],
  "resource_documentation": "https://github.com/rafaself/aws-mcp-gateway"
}
```

### WWW-Authenticate challenge

Unauthenticated `/mcp` requests in `AUTH_MODE=oauth` return:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://<worker-host>/.well-known/oauth-protected-resource", scope="aws:read"
```

Response body (normalized public error):

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Authentication is required.",
    "retryable": false
  }
}
```

### Token validation (oauth mode)

When `AUTH_MODE=oauth`, `/mcp` accepts only valid OAuth access tokens. Validation requires:

- `Authorization` header exists
- Scheme is `Bearer`
- Either JWT signature verifies against configured JWKS (`OAUTH_JWKS_URI`) or the configured introspection endpoint marks the token active
- `iss` equals `OAUTH_ISSUER`
- `aud` or `resource` matches `OAUTH_AUDIENCE` (origin) or the same value with `/mcp` appended
- `exp` is valid
- `nbf` is valid when present
- `scope` (space-delimited string), `scp` (array), or `permissions` (array, Auth0 RBAC) includes every configured required scope (`aws:read`)

Invalid, missing, expired, malformed, wrong-issuer, wrong-audience, wrong-signature, and insufficient-scope tokens must not reach MCP server creation or AWS calls.

### Staged `/mcp` request flow

```text
1. Identify auth mode from env
2. Validate mode-specific public auth config
3. Authenticate request
4. On auth failure: return 401/403 with normalized error and OAuth challenge where appropriate
4a. In oauth mode: enforce request throttling before the MCP server is created
5. Only after auth succeeds: validate full gateway config including AWS credentials
6. Build GatewayContext
7. Create MCP server and handle request
```

### Tool descriptor metadata

Every public MCP tool must declare:

```ts
securitySchemes: [{ type: "oauth2", scopes: ["aws:read"] }],
_meta: { securitySchemes: [{ type: "oauth2", scopes: ["aws:read"] }] },
annotations: {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true, // false for get_gateway_status
}
```

Tools returning `structuredContent` must include `outputSchema` matching `docs/mcp-tools.md`.

## Security and safety

- **No auth is rejected** for production AWS account data.
- OAuth protects who may call the gateway; IAM still limits what the gateway can read from AWS.
- OAuth does not permit write tools or generic AWS API access.
- Auth failures must never leak tokens, JWT claims, JWKS contents, AWS secrets, or provider error bodies.
- Unauthenticated callers must not receive detailed AWS configuration error messages.

## Test plan

| Area | Tests |
|------|-------|
| Metadata route | Returns 200 with expected fields in oauth mode; no AWS credentials required |
| OAuth challenge | 401 on unauthenticated `/mcp` includes `WWW-Authenticate` with `resource_metadata` |
| JWT validation | Offline tests with fixture JWKS: valid/invalid/expired/wrong-iss/wrong-aud/missing-scope |
| Local bearer | Existing bearer path unchanged when `AUTH_MODE=local-bearer` |
| Tool descriptors | Contract tests via `tools/list`: securitySchemes, annotations, outputSchema |
| Secret safety | No tokens, claims, or credentials in responses or logs |

All unit tests must remain offline and deterministic — no live Auth0, JWKS, Cloudflare, or AWS calls.

## Connector linking regression checklist

Use this checklist when changing auth, metadata, or descriptor code. Each item maps to offline contract tests.

| Contract | Expected behavior | Test surface |
|----------|-------------------|--------------|
| Protected resource metadata | `200` with `resource`, `authorization_servers`, `scopes_supported`, `resource_documentation`; works without AWS creds; `404` outside oauth mode | `src/index.oauth.test.ts`, `src/auth/oauth/metadata.test.ts` |
| Invalid OAuth config on metadata | Safe `503` without binding names or secrets | `src/index.oauth.test.ts` |
| Unauthenticated `/mcp` challenge | `401` with `Bearer`, `resource_metadata`, `scope`, `invalid_token`; no MCP server creation | `src/index.oauth.test.ts`, `src/auth/oauth/challenge.test.ts` |
| Insufficient scope | `403` with `insufficient_scope`; no MCP server creation | `src/index.oauth.test.ts`, `src/auth/oauth/verify-token.test.ts` |
| Tool descriptors | `securitySchemes`, `_meta.securitySchemes`, read-only annotations; no write/proxy scopes | `src/mcp/tools/descriptor-contract.test.ts` |

### Tool-result OAuth metadata

Unauthenticated `/mcp` requests never reach tool execution, so tool-level `_meta["mcp/www_authenticate"]` is not required for the current linking model. Do **not** add tool-result OAuth metadata unless a real ChatGPT connector smoke test (see [chatgpt-connector-smoke-test.md](../chatgpt-connector-smoke-test.md)) proves the HTTP `WWW-Authenticate` challenge path fails.

## References

- [OpenAI Apps SDK authentication guide](https://developers.openai.com/apps-sdk/build/auth)
- [OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)
- [MCP authorization spec](https://modelcontextprotocol.io/specification)
- [RFC 9728 protected resource metadata](https://datatracker.ietf.org/doc/rfc9728/)
