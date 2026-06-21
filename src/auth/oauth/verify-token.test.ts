import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateOAuthRequest } from "./verify-token.js";
import { resetJwksCache, setJwksResolverForTesting } from "./jwks.js";
import {
  createTestOAuthFixture,
  TEST_OAUTH_AUDIENCE,
  TEST_OAUTH_ISSUER,
  TEST_OAUTH_JWKS_URI,
} from "../../test/fixtures/oauth-jwks.js";

function makeRequest(token: string | null, scheme = "Bearer"): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) {
    headers.set("Authorization", `${scheme} ${token}`);
  }
  return new Request("https://gateway.example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("authenticateOAuthRequest", () => {
  beforeEach(() => {
    resetJwksCache();
    vi.restoreAllMocks();
  });

  it("returns 401 with challenge when Authorization header is missing", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await authenticateOAuthRequest(makeRequest(null), fixture.config);

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    const body = await response!.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Authentication is required.");
    expect(JSON.stringify(body)).not.toContain("eyJ");
  });

  it("returns 401 when Authorization scheme is not Bearer", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await authenticateOAuthRequest(makeRequest("token", "Basic"), fixture.config);

    expect(response?.status).toBe(401);
  });

  it("returns 401 for malformed JWT", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await authenticateOAuthRequest(makeRequest("not-a-jwt"), fixture.config);

    expect(response?.status).toBe(401);
  });

  it("returns 401 for expired JWT", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scope: "aws:read" }, { expiresIn: "-1h" });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response?.status).toBe(401);
  });

  it("returns 401 for wrong issuer", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken(
      { scope: "aws:read" },
      { issuer: "https://wrong.example.com/" },
    );

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response?.status).toBe(401);
  });

  it("returns 401 for wrong audience", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken(
      { scope: "aws:read" },
      { audience: "https://wrong.example.com" },
    );

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });

  it("returns 401 for wrong JWT signature", async () => {
    const signingFixture = await createTestOAuthFixture();
    const verifyingFixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, verifyingFixture.jwksResolver);
    const token = await signingFixture.signAccessToken();

    const response = await authenticateOAuthRequest(makeRequest(token), verifyingFixture.config);

    expect(response?.status).toBe(401);
  });

  it("returns 403 when required scope is missing", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scope: "openid profile" });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response?.status).toBe(403);
    const body = await response!.json() as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
    expect(response?.headers.get("WWW-Authenticate")).toContain('error="insufficient_scope"');
  });

  it("accepts valid scope string containing aws:read", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scope: "openid profile aws:read" });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response).toBeNull();
  });

  it("accepts valid scp array containing aws:read", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scp: ["openid", "profile", "aws:read"] });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response).toBeNull();
  });

  it("does not leak token or claim details in error responses", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken(
      { scope: "aws:read", sub: "user-123", email: "user@example.com" },
      { issuer: "https://wrong.example.com/" },
    );

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);
    const body = await response!.json();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("user-123");
    expect(serialized).not.toContain("user@example.com");
    expect(serialized).not.toContain(TEST_OAUTH_ISSUER);
    expect(serialized).not.toContain(TEST_OAUTH_AUDIENCE);
  });

  it("accepts tokens with a resource claim matching the configured audience", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({
      scope: "aws:read",
      resource: TEST_OAUTH_AUDIENCE,
    });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response).toBeNull();
  });

  it("accepts opaque tokens through introspection mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        active: true,
        iss: TEST_OAUTH_ISSUER,
        aud: TEST_OAUTH_AUDIENCE,
        scope: "aws:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    const response = await authenticateOAuthRequest(
      makeRequest("opaque-token-value"),
      {
        MCP_RESOURCE_URL: TEST_OAUTH_AUDIENCE,
        OAUTH_ISSUER: TEST_OAUTH_ISSUER,
        OAUTH_AUDIENCE: TEST_OAUTH_AUDIENCE,
        OAUTH_REQUIRED_SCOPES: ["aws:read"],
        OAUTH_TOKEN_VALIDATION_MODE: "introspection",
        OAUTH_INTROSPECTION: {
          url: "https://auth.example.com/oauth/introspect",
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      },
    );

    expect(response).toBeNull();
  });

  it("supports hybrid validation for opaque tokens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        active: true,
        iss: TEST_OAUTH_ISSUER,
        resource: TEST_OAUTH_AUDIENCE,
        scope: "aws:read",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );

    const response = await authenticateOAuthRequest(
      makeRequest("opaque-token-value"),
      {
        MCP_RESOURCE_URL: TEST_OAUTH_AUDIENCE,
        OAUTH_ISSUER: TEST_OAUTH_ISSUER,
        OAUTH_AUDIENCE: TEST_OAUTH_AUDIENCE,
        OAUTH_JWKS_URI: TEST_OAUTH_JWKS_URI,
        OAUTH_REQUIRED_SCOPES: ["aws:read"],
        OAUTH_TOKEN_VALIDATION_MODE: "hybrid",
        OAUTH_INTROSPECTION: {
          url: "https://auth.example.com/oauth/introspect",
          clientId: "client-id",
          clientSecret: "client-secret",
        },
      },
    );

    expect(response).toBeNull();
  });
});
