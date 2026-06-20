import { describe, it, expect } from "vitest";
import { buildGatewayContext } from "./context.js";

describe("buildGatewayContext", () => {
  it("extracts credentials from environment bindings", () => {
    const ctx = buildGatewayContext({
      AWS_ACCESS_KEY_ID: "AKIA-test",
      AWS_SECRET_ACCESS_KEY: "test-secret",
      AWS_REGION: "us-east-1",
      AWS_ALLOWED_REGIONS: "us-east-1,us-west-2",
    });

    expect(ctx.credentials).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
    });
  });

  it("extracts region and allowedRegions", () => {
    const ctx = buildGatewayContext({
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "eu-west-1",
      AWS_ALLOWED_REGIONS: "eu-west-1,us-east-1",
    });

    expect(ctx.region).toBe("eu-west-1");
    expect(ctx.allowedRegions).toEqual(["eu-west-1", "us-east-1"]);
  });

  it("defaults region to us-east-1 and allowedRegions to us-east-1 when missing", () => {
    const ctx = buildGatewayContext({
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
    });

    expect(ctx.region).toBe("us-east-1");
    expect(ctx.allowedRegions).toEqual(["us-east-1"]);
  });

  it("passes cache binding when present", () => {
    const cache = {} as never;
    const ctx = buildGatewayContext({
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ALLOWED_REGIONS: "us-east-1",
      AWS_MCP_CACHE: cache,
    });

    expect(ctx.cache).toBe(cache);
  });

  it("leaves cache undefined when binding absent", () => {
    const ctx = buildGatewayContext({
      AWS_ACCESS_KEY_ID: "key",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ALLOWED_REGIONS: "us-east-1",
    });

    expect(ctx.cache).toBeUndefined();
  });
});
