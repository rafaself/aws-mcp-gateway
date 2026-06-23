import { describe, it, expect } from "vitest";
import type { EnvValidationFailure, EnvValidationSuccess } from "./env.js";
import { validateEnv, envErrorResponse } from "./env.js";

const rateLimiterBinding = {} as never;

describe("validateEnv", () => {
  it("rejects missing required bindings", () => {
    const env = {};

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_ACCESS_KEY_ID");
    expect(result.errors).toContain("AWS_SECRET_ACCESS_KEY");
    expect(result.errors).toContain("AWS_REGION");
    expect(result.errors).toContain("AWS_ALLOWED_REGIONS");
    expect(result.errors).toContain("MCP_AUTH_TOKEN");
  });

  it("rejects an empty AWS_ALLOWED_REGIONS value", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_ALLOWED_REGIONS");
  });

  it("rejects an AWS_ALLOWED_REGIONS with only whitespace and commas", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: " , ",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_ALLOWED_REGIONS (empty after parsing)");
  });

  it("rejects AWS_REGION when not included in AWS_ALLOWED_REGIONS", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "eu-west-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_REGION (not in AWS_ALLOWED_REGIONS)");
  });

  it("accepts valid required bindings and returns validated config", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env) as EnvValidationSuccess;
    const config = result.config;

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(config.AWS_ACCESS_KEY_ID).toBe("key");
    expect(config.AWS_SECRET_ACCESS_KEY).toBe("secret");
    expect(config.AWS_REGION).toBe("us-east-1");
    expect(config.AWS_ALLOWED_REGIONS).toBe("us-east-1,us-west-2");
    expect(config.MCP_AUTH_TOKEN).toBe("token");
    expect(config.AWS_MCP_CACHE).toBeUndefined();
  });

  it("applies default tool exposure config when vars are absent", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.valid).toBe(true);
    expect([...result.config.toolExposure.enabledToolPacks].sort()).toEqual(
      ["core", "cost", "database", "inventory", "observability"].sort(),
    );
    expect(result.config.toolExposure.enabledTools).toEqual([]);
    expect(result.config.toolExposure.disabledTools.size).toBe(0);
    expect(result.config.toolExposure.maxRiskLevel).toBe("read-only");
  });

  it("rejects unknown tool pack names", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_ENABLED_TOOL_PACKS: "core,unknown-pack",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AWS_MCP_ENABLED_TOOL_PACKS (unknown pack: unknown-pack)");
  });

  it("rejects unknown enabled tool names", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_ENABLED_TOOLS: "search,not_a_real_tool",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AWS_MCP_ENABLED_TOOLS (unknown tool: not_a_real_tool)");
  });

  it("rejects unknown disabled tool names", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_DISABLED_TOOLS: "fake_tool",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AWS_MCP_DISABLED_TOOLS (unknown tool: fake_tool)");
  });

  it("rejects unsupported risk levels", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_MAX_RISK_LEVEL: "write",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AWS_MCP_MAX_RISK_LEVEL (unsupported risk level: write)");
  });

  it("parses custom tool exposure settings", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_ENABLED_TOOL_PACKS: "cost",
      AWS_MCP_DISABLED_TOOLS: "get_aws_cost_by_service",
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.valid).toBe(true);
    expect([...result.config.toolExposure.enabledToolPacks]).toEqual(["cost"]);
    expect([...result.config.toolExposure.disabledTools]).toEqual(["get_aws_cost_by_service"]);
  });

  it("includes AWS_MCP_CACHE when present in environment", () => {
    const cache = {} as never;
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      MCP_AUTH_TOKEN: "token",
      AWS_MCP_CACHE: cache,
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.valid).toBe(true);
    expect(result.config.AWS_MCP_CACHE).toBe(cache);
  });

  it("rejects non-string values for required bindings", () => {
    const env = {
      AWS_ACCESS_KEY_ID: 123,
      AWS_SECRET_ACCESS_KEY: true,
      AWS_REGION: null,
      AWS_ALLOWED_REGIONS: "us-east-1",
      MCP_AUTH_TOKEN: ["not-a-string"],
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_ACCESS_KEY_ID");
    expect(result.errors).toContain("AWS_SECRET_ACCESS_KEY");
    expect(result.errors).toContain("AWS_REGION");
    expect(result.errors).toContain("MCP_AUTH_TOKEN");
    expect(result.errors).not.toContain("AWS_ALLOWED_REGIONS");
  });

  it("rejects whitespace-only values for required bindings", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "   ",
      AWS_SECRET_ACCESS_KEY: "\t\n",
      AWS_REGION: "",
      AWS_ALLOWED_REGIONS: "us-east-1",
      MCP_AUTH_TOKEN: " ",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
    expect(result.config).toBeNull();
    expect(result.errors).toContain("AWS_ACCESS_KEY_ID");
    expect(result.errors).toContain("AWS_SECRET_ACCESS_KEY");
    expect(result.errors).toContain("AWS_REGION");
    expect(result.errors).toContain("MCP_AUTH_TOKEN");
    expect(result.errors).not.toContain("AWS_ALLOWED_REGIONS");
  });

  it("trims whitespace from valid binding values", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "  AKIA-test  ",
      AWS_SECRET_ACCESS_KEY: "\nsecret\n",
      AWS_REGION: " eu-west-1\t",
      AWS_ALLOWED_REGIONS: "  eu-west-1,us-east-1  ",
      MCP_AUTH_TOKEN: " bearer-token ",
    };

    const result = validateEnv(env) as EnvValidationSuccess;
    const config = result.config;

    expect(result.valid).toBe(true);
    expect(config.AWS_ACCESS_KEY_ID).toBe("AKIA-test");
    expect(config.AWS_SECRET_ACCESS_KEY).toBe("secret");
    expect(config.AWS_REGION).toBe("eu-west-1");
    expect(config.AWS_ALLOWED_REGIONS).toBe("eu-west-1,us-east-1");
    expect(config.MCP_AUTH_TOKEN).toBe("bearer-token");
  });

  it("accepts matching origin-level MCP_RESOURCE_URL and OAUTH_AUDIENCE", () => {
    const env = {
      AUTH_MODE: "oauth",
      MCP_RESOURCE_URL: "https://example.workers.dev",
      OAUTH_ISSUER: "https://auth.example.com/",
      OAUTH_AUDIENCE: "https://example.workers.dev",
      OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPES: "aws:read",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      AUTH_RATE_LIMITER: rateLimiterBinding,
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.valid).toBe(true);
    expect(result.config.oauth?.MCP_RESOURCE_URL).toBe("https://example.workers.dev");
    expect(result.config.oauth?.OAUTH_AUDIENCE).toBe("https://example.workers.dev");
  });

  it("does not require MCP_AUTH_TOKEN in oauth mode", () => {
    const env = {
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
      AUTH_RATE_LIMITER: rateLimiterBinding,
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.valid).toBe(true);
    expect(result.config.authMode).toBe("oauth");
    expect(result.config.MCP_AUTH_TOKEN).toBeUndefined();
    expect(result.config.oauth?.OAUTH_REQUIRED_SCOPES).toEqual(["aws:read"]);
    expect(result.config.rateLimit?.namespace).toBe(rateLimiterBinding);
  });

  it("defaults to local-bearer when AUTH_MODE is absent", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env) as EnvValidationSuccess;

    expect(result.config.authMode).toBe("local-bearer");
  });

  it("rejects invalid AUTH_MODE values", () => {
    const result = validateEnv({
      AUTH_MODE: "open",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      MCP_AUTH_TOKEN: "token",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AUTH_MODE (must be local-bearer or oauth)");
  });

  it("rejects non-https OAuth URLs in oauth mode", () => {
    const result = validateEnv({
      AUTH_MODE: "oauth",
      MCP_RESOURCE_URL: "http://gateway.example.com",
      OAUTH_ISSUER: "https://auth.example.com/",
      OAUTH_AUDIENCE: "https://gateway.example.com",
      OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPES: "aws:read",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      AUTH_RATE_LIMITER: rateLimiterBinding,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("MCP_RESOURCE_URL (must be an https URL)");
  });

  it("requires OAUTH_AUDIENCE to equal MCP_RESOURCE_URL", () => {
    const result = validateEnv({
      AUTH_MODE: "oauth",
      MCP_RESOURCE_URL: "https://gateway.example.com",
      OAUTH_ISSUER: "https://auth.example.com/",
      OAUTH_AUDIENCE: "https://other.example.com",
      OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
      OAUTH_REQUIRED_SCOPES: "aws:read",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      AUTH_RATE_LIMITER: rateLimiterBinding,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("OAUTH_AUDIENCE (must equal MCP_RESOURCE_URL)");
  });

  it("requires rate limiting in oauth mode", () => {
    const result = validateEnv({
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
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("AUTH_RATE_LIMITER");
  });

  it("accepts introspection-only oauth validation", () => {
    const result = validateEnv({
      AUTH_MODE: "oauth",
      MCP_RESOURCE_URL: "https://gateway.example.com",
      OAUTH_ISSUER: "https://auth.example.com/",
      OAUTH_AUDIENCE: "https://gateway.example.com",
      OAUTH_REQUIRED_SCOPES: "aws:read",
      OAUTH_TOKEN_VALIDATION_MODE: "introspection",
      OAUTH_INTROSPECTION_URL: "https://auth.example.com/oauth/introspect",
      OAUTH_INTROSPECTION_CLIENT_ID: "client-id",
      OAUTH_INTROSPECTION_CLIENT_SECRET: "client-secret",
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1",
      AUTH_RATE_LIMITER: rateLimiterBinding,
    });

    expect(result.valid).toBe(true);
    expect((result as EnvValidationSuccess).config.oauth?.OAUTH_TOKEN_VALIDATION_MODE).toBe(
      "introspection",
    );
  });
});

describe("envErrorResponse", () => {
  const validationResult: EnvValidationFailure = {
    valid: false,
    config: null,
    errors: ["AWS_ACCESS_KEY_ID", "MCP_AUTH_TOKEN"],
  };

  it("does not expose missing binding names to unauthenticated callers", async () => {
    const response = envErrorResponse(validationResult, false);
    const body = await response.json() as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toBe("Gateway configuration is incomplete.");
    expect(body.error.message).not.toContain("AWS_ACCESS_KEY_ID");
    expect(body.error.message).not.toContain("MCP_AUTH_TOKEN");
  });

  it("exposes invalid binding names only after authentication", async () => {
    const response = envErrorResponse(validationResult, true);
    const body = await response.json() as { error: { message: string } };

    expect(response.status).toBe(503);
    expect(body.error.message).toContain("AWS_ACCESS_KEY_ID");
    expect(body.error.message).toContain("MCP_AUTH_TOKEN");
  });
});
