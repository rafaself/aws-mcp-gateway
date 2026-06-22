import { describe, it, expect } from "vitest";
import type { ValidatedGatewayConfig } from "./env.js";
import { buildGatewayContext } from "./context.js";

const validConfig: ValidatedGatewayConfig = {
  authMode: "local-bearer",
  AWS_ACCESS_KEY_ID: "AKIA-test",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "us-east-1",
  AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
  MCP_AUTH_TOKEN: "token",
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
});
