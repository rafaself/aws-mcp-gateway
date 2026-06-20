import { describe, it, expect, vi } from "vitest";

vi.mock("agents/mcp", () => ({
  createMcpHandler: () => async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
}));

vi.mock("./mcp/server.js", () => ({
  createServer: () => ({}),
}));

const { default: worker } = await import("./index.js");

const oauthEnv = {
  AUTH_MODE: "oauth",
  MCP_RESOURCE_URL: "https://gateway.example.com",
  OAUTH_ISSUER: "https://auth.example.com/",
  OAUTH_AUDIENCE: "https://gateway.example.com",
  OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
  OAUTH_REQUIRED_SCOPES: "aws:read",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1",
};

const legacyEnv = {
  AUTH_MODE: "legacy-bearer",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1",
  MCP_AUTH_TOKEN: "valid-token",
};

describe("oauth protected-resource metadata route", () => {
  it("returns 200 with expected fields in oauth mode", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/.well-known/oauth-protected-resource"),
      oauthEnv,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      resource: "https://gateway.example.com",
      authorization_servers: ["https://auth.example.com/"],
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
});

describe("oauth /mcp challenge", () => {
  it("returns 401 with WWW-Authenticate for unauthenticated requests", async () => {
    const response = await worker.fetch(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      oauthEnv,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    const wwwAuth = response.headers.get("WWW-Authenticate");
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("scope=");
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Authentication is required.");
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
  });
});
