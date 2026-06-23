import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkParameterInventory } from "./client.js";
import { SSM_DESCRIBE_PARAMETERS_TARGET } from "./requests.js";
import type { AwsCredentials } from "../types.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

function describeParametersResponse(
  parameters: Array<Record<string, unknown>>,
  nextToken?: string,
): Response {
  return new Response(
    JSON.stringify({
      Parameters: parameters,
      ...(nextToken ? { NextToken: nextToken } : {}),
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-amz-json-1.1" },
    },
  );
}

function getRequestTarget(callIndex = 0): string {
  const init = mockFetch.mock.calls[callIndex][1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  return headers["X-Amz-Target"] ?? headers["x-amz-target"] ?? "";
}

function getRequestBody(callIndex = 0): Record<string, unknown> {
  const init = mockFetch.mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("checkParameterInventory", () => {
  it("calls DescribeParameters with BeginsWith filter and never GetParameters", async () => {
    mockFetch.mockResolvedValue(
      describeParametersResponse([
        {
          Name: "/app/prod/db/host",
          Type: "SecureString",
          Version: 2,
          LastModifiedDate: 1_718_000_000_000,
          KeyId: "alias/aws/ssm",
          Value: "must-not-leak",
        },
      ]),
    );

    const result = await checkParameterInventory(
      {
        parameterPrefix: "/app/prod",
        requiredParameterNames: ["db/host", "missing"],
        region: "us-east-1",
      },
      credentials,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(getRequestTarget()).toBe(SSM_DESCRIBE_PARAMETERS_TARGET);
    expect(getRequestBody()).toMatchObject({
      ParameterFilters: [
        {
          Key: "Name",
          Option: "BeginsWith",
          Values: ["/app/prod"],
        },
      ],
    });
    expect(JSON.stringify(getRequestBody())).not.toContain("WithDecryption");
    expect(JSON.stringify(getRequestBody())).not.toContain("GetParameters");

    expect(result.missingCount).toBe(1);
    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0]).toMatchObject({
      name: "db/host",
      path: "/app/prod/db/host",
      exists: true,
      type: "SecureString",
      version: 2,
    });
    expect(result.parameters[1]).toMatchObject({
      name: "missing",
      exists: false,
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("Value");
  });

  it("reports missing parameters without failing the request", async () => {
    mockFetch.mockResolvedValue(describeParametersResponse([]));

    const result = await checkParameterInventory(
      {
        parameterPrefix: "/app/prod",
        requiredParameterNames: ["a", "b"],
        region: "us-east-1",
      },
      credentials,
    );

    expect(result.missingCount).toBe(2);
    expect(result.parameters.every((entry) => !entry.exists)).toBe(true);
  });

  it("rejects invalid prefix before AWS call", async () => {
    await expect(
      checkParameterInventory(
        {
          parameterPrefix: "app/prod",
          requiredParameterNames: ["db/host"],
          region: "us-east-1",
        },
        credentials,
      ),
    ).rejects.toThrow();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("normalizes AWS errors", async () => {
    mockFetch.mockResolvedValue(
      new Response("password=leaked-secret", {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      checkParameterInventory(
        {
          parameterPrefix: "/app/prod",
          requiredParameterNames: ["db/host"],
          region: "us-east-1",
        },
        credentials,
      ),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
