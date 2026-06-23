import { describe, it, expect } from "vitest";
import type { ValidatedGatewayConfig } from "./env.js";
import { buildGatewayContext } from "./context.js";
import { defaultResolvedToolExposure } from "./tool-exposure.js";

const validConfig: ValidatedGatewayConfig = {
  authMode: "local-bearer",
  AWS_ACCESS_KEY_ID: "AKIA-test",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
  MCP_AUTH_TOKEN: "token",
  toolExposure: defaultResolvedToolExposure(),
};

describe("buildGatewayContext", () => {
  it("extracts credentials from validated configuration", () => {
    const ctx = buildGatewayContext(validConfig);

    expect(ctx.credentials).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
    });
  });

  it("extracts region and allowedRegions from validated configuration", () => {
    const ctx = buildGatewayContext({
      ...validConfig,
      AWS_REGION: "eu-west-1",
      AWS_ALLOWED_REGIONS: "eu-west-1,us-east-1",
    });

    expect(ctx.region).toBe("eu-west-1");
    expect(ctx.allowedRegions).toEqual(["eu-west-1", "us-east-1"]);
  });

  it("passes cache binding when present", () => {
    const cache = {} as never;
    const ctx = buildGatewayContext({
      ...validConfig,
      AWS_MCP_CACHE: cache,
    });

    expect(ctx.cache).toBe(cache);
  });

  it("leaves cache undefined when binding absent", () => {
    const ctx = buildGatewayContext(validConfig);

    expect(ctx.cache).toBeUndefined();
  });

  it("extracts auth mode and oauth scopes when present", () => {
    const ctx = buildGatewayContext({
      ...validConfig,
      authMode: "oauth",
      oauth: {
        MCP_RESOURCE_URL: "https://aws-mcp-gateway.example.workers.dev/mcp",
        OAUTH_ISSUER: "https://issuer.example.com",
        OAUTH_AUDIENCE: "https://aws-mcp-gateway.example.workers.dev/mcp",
        OAUTH_JWKS_URI: "https://issuer.example.com/.well-known/jwks.json",
        OAUTH_REQUIRED_SCOPES: ["aws:read", "openid"],
        OAUTH_TOKEN_VALIDATION_MODE: "jwks",
      },
    });

    expect(ctx.authMode).toBe("oauth");
    expect(ctx.oauthRequiredScopes).toEqual(["aws:read", "openid"]);
  });

  it("passes granted scopes from build options", () => {
    const ctx = buildGatewayContext(validConfig, { grantedScopes: ["aws:read", "openid"] });

    expect(ctx.grantedScopes).toEqual(["aws:read", "openid"]);
  });

  it("creates a credential resolver from default credentials", async () => {
    const ctx = buildGatewayContext(validConfig);

    const credentials = await ctx.credentialResolver.resolve({ strategy: "default" });

    expect(credentials).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
      source: "default",
    });
  });

  it("passes tool exposure from validated configuration", () => {
    const ctx = buildGatewayContext({
      ...validConfig,
      toolExposure: {
        enabledToolPacks: new Set(["cost"]),
        enabledTools: [],
        disabledTools: new Set(),
        maxRiskLevel: "read-only",
      },
    });

    expect([...ctx.toolExposure.enabledToolPacks]).toEqual(["cost"]);
  });
});
