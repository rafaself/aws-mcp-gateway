import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCredentialResolver,
  CREDENTIAL_REFRESH_MARGIN_MS,
} from "./resolver.js";
import type { AwsCredentials } from "../types.js";

const mockAssumeRole = vi.fn();

vi.mock("../sts/assume-role.js", () => ({
  assumeRole: (...args: unknown[]) => mockAssumeRole(...args),
}));

const defaultCredentials: AwsCredentials = {
  accessKeyId: "AKIA-test",
  secretAccessKey: "test-secret",
};

const roleArn = "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly";

function assumedCredentials(expiresAt: number): AwsCredentials {
  return {
    accessKeyId: "ASIAEXAMPLE",
    secretAccessKey: "secret-example",
    sessionToken: "session-token-example",
    expiresAt,
    source: "assume-role",
  };
}

beforeEach(() => {
  mockAssumeRole.mockReset();
});

describe("createCredentialResolver", () => {
  it("returns default credentials for the default strategy", async () => {
    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
    });

    const result = await resolver.resolve({ strategy: "default" });

    expect(result).toEqual({
      ...defaultCredentials,
      source: "default",
    });
    expect(mockAssumeRole).not.toHaveBeenCalled();
  });

  it("assumes a role and caches credentials in memory", async () => {
    const now = 1_700_000_000_000;
    mockAssumeRole.mockResolvedValue(assumedCredentials(now + 60 * 60 * 1000));

    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
      now: () => now,
    });

    const first = await resolver.resolve({ strategy: "assume-role", roleArn });
    const second = await resolver.resolve({ strategy: "assume-role", roleArn });

    expect(first.source).toBe("assume-role");
    expect(second).toEqual(first);
    expect(mockAssumeRole).toHaveBeenCalledTimes(1);
  });

  it("refreshes credentials when near expiry", async () => {
    const now = 1_700_000_000_000;
    const nearExpiry = now + CREDENTIAL_REFRESH_MARGIN_MS - 1_000;
    const refreshedExpiry = now + 60 * 60 * 1000;

    mockAssumeRole
      .mockResolvedValueOnce(assumedCredentials(nearExpiry))
      .mockResolvedValueOnce(assumedCredentials(refreshedExpiry));

    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
      now: () => now,
    });

    await resolver.resolve({ strategy: "assume-role", roleArn });
    const refreshed = await resolver.resolve({ strategy: "assume-role", roleArn });

    expect(mockAssumeRole).toHaveBeenCalledTimes(2);
    expect(refreshed.expiresAt).toBe(refreshedExpiry);
  });

  it("refreshes credentials after expiry", async () => {
    const now = 1_700_000_000_000;
    mockAssumeRole
      .mockResolvedValueOnce(assumedCredentials(now - 1_000))
      .mockResolvedValueOnce(assumedCredentials(now + 60 * 60 * 1000));

    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
      now: () => now,
    });

    await resolver.resolve({ strategy: "assume-role", roleArn });
    await resolver.resolve({ strategy: "assume-role", roleArn });

    expect(mockAssumeRole).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid role ARNs", async () => {
    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
    });

    await expect(
      resolver.resolve({ strategy: "assume-role", roleArn: "not-an-arn" }),
    ).rejects.toThrow("Invalid role ARN.");
  });

  it("uses separate cache entries for different external IDs", async () => {
    const now = 1_700_000_000_000;
    mockAssumeRole.mockResolvedValue(assumedCredentials(now + 60 * 60 * 1000));

    const resolver = createCredentialResolver({
      defaultCredentials,
      region: "us-east-1",
      now: () => now,
    });

    await resolver.resolve({
      strategy: "assume-role",
      roleArn,
      externalId: "one",
    });
    await resolver.resolve({
      strategy: "assume-role",
      roleArn,
      externalId: "two",
    });

    expect(mockAssumeRole).toHaveBeenCalledTimes(2);
  });
});
