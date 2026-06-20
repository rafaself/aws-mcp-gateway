import { describe, it, expect } from "vitest";
import { validateEnv, envErrorResponse } from "./env.js";

describe("validateEnv", () => {
  it("rejects missing required bindings", () => {
    const env = {};

    const result = validateEnv(env);

    expect(result.valid).toBe(false);
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
    expect(result.errors).toContain("AWS_REGION (not in AWS_ALLOWED_REGIONS)");
  });

  it("accepts valid required bindings", () => {
    const env = {
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
      MCP_AUTH_TOKEN: "token",
    };

    const result = validateEnv(env);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("envErrorResponse", () => {
  const validationResult = {
    valid: false,
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
