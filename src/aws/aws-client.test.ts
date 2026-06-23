import { describe, it, expect, vi } from "vitest";
import { createAwsClient } from "./aws-client.js";
import type { AwsCredentials } from "./types.js";

const { awsClientConstructors } = vi.hoisted(() => {
  const awsClientConstructors: Array<Record<string, unknown>> = [];
  return { awsClientConstructors };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    constructor(opts: Record<string, unknown>) {
      awsClientConstructors.push(opts);
    }
  },
}));

describe("createAwsClient", () => {
  it("passes access key, secret, service, and region", () => {
    const credentials: AwsCredentials = {
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
    };

    createAwsClient(credentials, "ec2", "us-east-1");

    expect(awsClientConstructors.at(-1)).toEqual({
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
      service: "ec2",
      region: "us-east-1",
    });
  });

  it("includes sessionToken when present", () => {
    const credentials: AwsCredentials = {
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
      sessionToken: "session-token-value",
    };

    createAwsClient(credentials, "sts", "us-east-1");

    expect(awsClientConstructors.at(-1)).toEqual(
      expect.objectContaining({
        sessionToken: "session-token-value",
      }),
    );
  });

  it("omits sessionToken when absent", () => {
    const credentials: AwsCredentials = {
      accessKeyId: "AKIA-test",
      secretAccessKey: "test-secret",
    };

    createAwsClient(credentials, "s3", "us-east-1");

    expect(awsClientConstructors.at(-1)).not.toHaveProperty("sessionToken");
  });
});
