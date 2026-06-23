import { beforeEach, describe, expect, it, vi } from "vitest";
import { assumeRole } from "./assume-role.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";

const { mockFetch, awsClientConstructors } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  const awsClientConstructors: Array<Record<string, unknown>> = [];
  return { mockFetch, awsClientConstructors };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;

    constructor(opts: Record<string, unknown>) {
      awsClientConstructors.push(opts);
    }
  },
}));

const defaultCredentials: AwsCredentials = {
  accessKeyId: "AKIA-test",
  secretAccessKey: "test-secret",
};

const SUCCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <AssumeRoleResult>
    <Credentials>
      <AccessKeyId>ASIAEXAMPLE</AccessKeyId>
      <SecretAccessKey>secret-example</SecretAccessKey>
      <SessionToken>session-token-example</SessionToken>
      <Expiration>2026-06-23T12:00:00Z</Expiration>
    </Credentials>
  </AssumeRoleResult>
</AssumeRoleResponse>`;

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("assumeRole", () => {
  it("returns temporary credentials from a mocked STS response", async () => {
    mockFetch.mockResolvedValue(new Response(SUCCESS_XML, { status: 200 }));

    const result = await assumeRole(
      {
        roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly",
        region: "us-east-1",
      },
      defaultCredentials,
    );

    expect(result).toEqual(
      expect.objectContaining({
        accessKeyId: "ASIAEXAMPLE",
        secretAccessKey: "secret-example",
        sessionToken: "session-token-example",
        source: "assume-role",
      }),
    );
    expect(result.expiresAt).toBe(Date.parse("2026-06-23T12:00:00Z"));
  });

  it("includes ExternalId in the request body when provided", async () => {
    mockFetch.mockResolvedValue(new Response(SUCCESS_XML, { status: 200 }));

    await assumeRole(
      {
        roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly",
        region: "us-east-1",
        externalId: "trusted-external-id",
      },
      defaultCredentials,
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toContain("ExternalId=trusted-external-id");
  });

  it("normalizes STS failures without leaking credentials", async () => {
    mockFetch.mockResolvedValue(new Response("denied", { status: 403 }));

    const err = await assumeRole(
      {
        roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly",
        region: "us-east-1",
        externalId: "trusted-external-id",
      },
      defaultCredentials,
    ).catch((error: unknown) => error);

    expect(err).toBeInstanceOf(AwsRequestError);
    const payload = (err as AwsRequestError).toJSON();
    expect(payload.message).toBe("STS AssumeRole failed.");
    expect(JSON.stringify(payload)).not.toContain("trusted-external-id");
    expect(JSON.stringify(payload)).not.toContain("test-secret");
    expect(JSON.stringify(payload)).not.toContain("AKIA");
  });

  it("passes default credentials to AwsClient for signing", async () => {
    mockFetch.mockResolvedValue(new Response(SUCCESS_XML, { status: 200 }));

    await assumeRole(
      {
        roleArn: "arn:aws:iam::123456789012:role/AwsMcpGatewayReadOnly",
        region: "us-east-1",
      },
      defaultCredentials,
    );

    expect(awsClientConstructors[0]).toEqual(
      expect.objectContaining({
        accessKeyId: "AKIA-test",
        secretAccessKey: "test-secret",
        service: "sts",
        region: "us-east-1",
      }),
    );
  });
});
