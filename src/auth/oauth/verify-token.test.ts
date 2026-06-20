import { beforeEach, describe, expect, it } from "vitest";
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
  });

  it("returns 403 when required scope is missing", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scope: "openid profile" });

    const response = await authenticateOAuthRequest(makeRequest(token), fixture.config);

    expect(response?.status).toBe(403);
    const body = await response!.json() as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
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
});
