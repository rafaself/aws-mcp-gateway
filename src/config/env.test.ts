import { describe, it, expect } from "vitest";
import type { EnvValidationFailure, EnvValidationSuccess } from "./env.js";
import { validateEnv, envErrorResponse } from "./env.js";

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
