import { describe, expect, it } from "vitest";
import { buildRoleSessionName } from "./session-name.js";

describe("buildRoleSessionName", () => {
  it("builds a deterministic safe default session name", () => {
    const roleArn = "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly";
    const first = buildRoleSessionName(roleArn);
    const second = buildRoleSessionName(roleArn);

    expect(first).toBe(second);
    expect(first.startsWith("aws-mcp-gateway-")).toBe(true);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(first).toMatch(/^[\w+=,.@-]+$/);
  });

  it("accepts a valid custom session name", () => {
    expect(buildRoleSessionName("arn:aws:iam::123456789012:role/Test", "custom-session")).toBe(
      "custom-session",
    );
  });

  it("rejects invalid custom session names", () => {
    expect(() =>
      buildRoleSessionName("arn:aws:iam::123456789012:role/Test", "bad name"),
    ).toThrow("Invalid role session name.");
  });
});
