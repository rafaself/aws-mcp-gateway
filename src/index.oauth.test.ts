import { beforeEach, describe, it, expect, vi } from "vitest";
import { resetJwksCache, setJwksResolverForTesting } from "./auth/oauth/jwks.js";
import {
  createTestOAuthFixture,
  TEST_OAUTH_AUDIENCE,
  TEST_OAUTH_ISSUER,
  TEST_OAUTH_JWKS_URI,
} from "./test/fixtures/oauth-jwks.js";

const createServerMock = vi.fn((_ctx?: unknown) => ({}));

vi.mock("agents/mcp", () => ({
  createMcpHandler: () => async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
}));

vi.mock("./mcp/server.js", () => ({
  createServer: (ctx: unknown) => {
    createServerMock(ctx);
    return {};
  },
}));

const { default: worker } = await import("./index.js");

function makeRateLimiterBinding(allowed = true): DurableObjectNamespace {
  return {
    idFromName: () => "ratelimit-id" as never,
    get: () =>
      ({
        fetch: async () =>
          Response.json({
            allowed,
            limit: 10,
            remaining: allowed ? 9 : 0,
            resetAtMs: Date.now() + 60_000,
            retryAfterSeconds: 60,
          }),
      }) as never,
  } as never;
}

const oauthEnvBase = {
  AUTH_MODE: "oauth",
  MCP_RESOURCE_URL: TEST_OAUTH_AUDIENCE,
  OAUTH_ISSUER: TEST_OAUTH_ISSUER,
  OAUTH_AUDIENCE: TEST_OAUTH_AUDIENCE,
  OAUTH_JWKS_URI: TEST_OAUTH_JWKS_URI,
  OAUTH_REQUIRED_SCOPES: "aws:read",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1",
  AUTH_RATE_LIMITER: makeRateLimiterBinding(),
};

const legacyEnv = {
  AUTH_MODE: "legacy-bearer",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1",
  MCP_AUTH_TOKEN: "valid-token",
};

beforeEach(() => {
  resetJwksCache();
  createServerMock.mockClear();
});

describe("oauth protected-resource metadata route", () => {
  it("returns 200 with expected fields in oauth mode", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      resource: TEST_OAUTH_AUDIENCE,
      authorization_servers: [TEST_OAUTH_ISSUER],
      scopes_supported: ["aws:read"],
      resource_documentation: "https://github.com/rafaself/aws-mcp-gateway",
    });
  });

  it("does not require AWS credentials", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      {
        AUTH_MODE: "oauth",
        MCP_RESOURCE_URL: "https://gateway.example.com",
        OAUTH_ISSUER: "https://auth.example.com/",
        OAUTH_AUDIENCE: "https://gateway.example.com",
        OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
        OAUTH_REQUIRED_SCOPES: "aws:read",
      },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
  });

  it("returns 404 when not in oauth mode", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      legacyEnv,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it("returns 503 for invalid AUTH_MODE", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      { ...oauthEnvBase, AUTH_MODE: "open" },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
  });

  it("returns safe 503 for invalid OAuth config without leaking binding names", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      {
        AUTH_MODE: "oauth",
        MCP_RESOURCE_URL: "https://gateway.example.com",
        OAUTH_AUDIENCE: "https://gateway.example.com",
        OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
        OAUTH_REQUIRED_SCOPES: "aws:read",
      },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("configuration_error");
    expect(body).not.toContain("OAUTH_ISSUER");
    expect(body).not.toContain("AKIA");
    expect(body).not.toContain("client_secret");
    expect(body).not.toContain("BEGIN PUBLIC KEY");
  });

  it("does not expose secrets in metadata response body", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    const body = await response.text();
    expect(body).not.toContain("AKIA");
    expect(body).not.toContain("client_secret");
    expect(body).not.toContain("BEGIN PUBLIC KEY");
    expect(body).not.toContain("eyJ");
  });
});

describe("oauth /mcp challenge", () => {
  it("returns 401 with WWW-Authenticate for unauthenticated requests", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    const wwwAuth = response.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("scope=");
    expect(wwwAuth).toContain('error="invalid_token"');
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).not.toContain("AKIA");
    expect(wwwAuth).not.toContain("client_secret");
    expect(wwwAuth).not.toContain("BEGIN PUBLIC KEY");
    expect(wwwAuth).not.toContain("eyJ");
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Authentication is required.");
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("accepts valid OAuth JWT without MCP_AUTH_TOKEN", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken();

    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(createServerMock).toHaveBeenCalledTimes(1);
  });

  it("does not create MCP server for invalid OAuth tokens", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer not-a-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("does not create MCP server for insufficient-scope OAuth tokens", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);
    const token = await fixture.signAccessToken({ scope: "openid profile" });

    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      oauthEnvBase,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    const wwwAuth = response.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain('error="insufficient_scope"');
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("does not expose AWS config details to unauthenticated callers", async () => {
    const fixture = await createTestOAuthFixture();
    setJwksResolverForTesting(TEST_OAUTH_JWKS_URI, fixture.jwksResolver);

    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", { method: "POST" }),
      {
        ...oauthEnvBase,
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
      },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    const body = await response.json() as { error: { message: string } };
    expect(body.error.message).not.toContain("AWS_ACCESS_KEY_ID");
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("returns 429 before authentication when the caller exceeds the request budget", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", { method: "POST" }),
      {
        ...oauthEnvBase,
        AUTH_RATE_LIMITER: makeRateLimiterBinding(false),
      },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(429);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
    expect(createServerMock).not.toHaveBeenCalled();
  });
});

describe("/health", () => {
  it("remains public", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/health"),
      {},
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "aws-mcp-gateway",
    });
  });
});

describe("legacy bearer mode", () => {
  it("still rejects missing bearer token", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", { method: "POST" }),
      legacyEnv,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBeNull();
    expect(createServerMock).not.toHaveBeenCalled();
  });

  it("still accepts valid MCP_AUTH_TOKEN", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      legacyEnv,
      {} as ExecutionContext,
    );

    expect(response.status).not.toBe(401);
    expect(createServerMock).toHaveBeenCalledTimes(1);
  });
});
