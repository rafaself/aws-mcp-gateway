import { describe, expect, it } from "vitest";
import { buildCredentialCacheKey, isValidRoleArn } from "./helpers.js";

describe("credential helpers", () => {
  it("validates IAM role ARNs", () => {
    expect(isValidRoleArn("arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly")).toBe(true);
    expect(isValidRoleArn("arn:aws:iam::123456789012:role/path/ReadOnly")).toBe(true);
    expect(isValidRoleArn("not-an-arn")).toBe(false);
  });

  it("builds stable cache keys without embedding raw external IDs", async () => {
    const roleArn = "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly";
    const first = await buildCredentialCacheKey(roleArn, "secret-external-id");
    const second = await buildCredentialCacheKey(roleArn, "secret-external-id");
    const different = await buildCredentialCacheKey(roleArn, "other-external-id");

    expect(first).toBe(second);
    expect(different).not.toBe(first);
    expect(first).not.toContain("secret-external-id");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
