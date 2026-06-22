import { describe, it, expect, vi, beforeEach } from "vitest";
import { AwsCapabilityError } from "./capabilities.js";
import { awsRequest } from "./client.js";
import { AwsRequestError } from "./errors.js";
import type { AwsRequestOptions } from "./types.js";

const { mockFetch, awsClientConstructors } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  const awsClientConstructors: Array<Record<string, unknown>> = [];
  return { mockFetch, awsClientConstructors };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    accessKeyId: string;
    secretAccessKey: string;
    service: string | undefined;
    region: string | undefined;
    fetch = mockFetch;

    constructor(opts: {
      accessKeyId: string;
      secretAccessKey: string;
      service?: string;
      region?: string;
    }) {
      awsClientConstructors.push(opts);
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const credentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

function ec2Request(overrides: Partial<AwsRequestOptions> = {}): AwsRequestOptions {
  return {
    capability: "ec2:DescribeInstances",
    service: "ec2",
    region: "us-east-1",
    method: "GET",
    path: "/",
    ...overrides,
  };
}

function logsRequest(overrides: Partial<AwsRequestOptions> = {}): AwsRequestOptions {
  return {
    capability: "logs:FilterLogEvents",
    service: "logs",
    region: "us-east-1",
    method: "POST",
    path: "/",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("awsRequest", () => {
  it("rejects unknown capabilities before network I/O", async () => {
    await expect(
      awsRequest(
        {
          capability: "s3:GetObject" as "ec2:DescribeInstances",
          service: "s3",
          region: "us-east-1",
          method: "GET",
          path: "/",
        },
        credentials,
      ),
    ).rejects.toBeInstanceOf(AwsCapabilityError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects service/capability mismatches before network I/O", async () => {
    await expect(
      awsRequest(
        {
          capability: "ec2:DescribeInstances",
          service: "logs",
          region: "us-east-1",
          method: "GET",
          path: "/",
        },
        credentials,
      ),
    ).rejects.toBeInstanceOf(AwsCapabilityError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends a signed GET request and returns parsed JSON", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ Reservations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await awsRequest(ec2Request(), credentials);

    expect(result).toEqual({ Reservations: [] });
  });

  it("appends query parameters to the URL", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await awsRequest(
      ec2Request({
        query: { Action: "DescribeRegions", Version: "2016-11-15" },
      }),
      credentials,
    );

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("Action=DescribeRegions");
    expect(calledUrl).toContain("Version=2016-11-15");
  });

  it("serializes body as JSON", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await awsRequest(
      logsRequest({
        body: { user: "test" },
      }),
      credentials,
    );

    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.body).toBe(JSON.stringify({ user: "test" }));
  });

  it("includes caller-supplied headers", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await awsRequest(
      ec2Request({
        headers: { "X-Custom": "value" },
      }),
      credentials,
    );

    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers["X-Custom"]).toBe("value");
  });

  it("returns undefined for empty response body", async () => {
    mockFetch.mockResolvedValue(new Response("", { status: 200 }));

    const result = await awsRequest(ec2Request(), credentials);

    expect(result).toBeUndefined();
  });

  it("throws AwsRequestError with retryable=false for 4xx", async () => {
    mockFetch.mockResolvedValue(new Response("Not found", { status: 404 }));

    const err = await awsRequest(ec2Request(), credentials).catch((e) => e);

    expect(err).toBeInstanceOf(AwsRequestError);
    expect(err.code).toBe("aws_request_failed");
    expect(err.retryable).toBe(false);
    expect(err.statusCode).toBe(404);
  });

  it("throws AwsRequestError with retryable=true for 5xx", async () => {
    mockFetch.mockResolvedValue(
      new Response("Server error", { status: 503 }),
    );

    const err = await awsRequest(ec2Request(), credentials).catch((e) => e);

    expect(err).toBeInstanceOf(AwsRequestError);
    expect(err.code).toBe("aws_request_failed");
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(503);
  });

  it("throws AwsRequestError with retryable=true on abort/timeout", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    mockFetch.mockRejectedValue(abortError);

    const err = await awsRequest(ec2Request(), credentials).catch((e) => e);

    expect(err).toBeInstanceOf(AwsRequestError);
    expect(err.code).toBe("aws_request_failed");
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(0);
  });

  it("throws AwsRequestError on network error", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const err = await awsRequest(ec2Request(), credentials).catch((e) => e);

    expect(err).toBeInstanceOf(AwsRequestError);
    expect(err.code).toBe("aws_request_failed");
    expect(err.retryable).toBe(false);
  });

  it("passes credentials, service and region to AwsClient constructor", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await awsRequest(
      ec2Request({
        region: "eu-west-1",
      }),
      credentials,
    );

    expect(awsClientConstructors).toHaveLength(1);
    expect(awsClientConstructors[0]).toEqual(
      expect.objectContaining({
        accessKeyId: "AKIA-test-key",
        secretAccessKey: "test-secret",
        service: "ec2",
        region: "eu-west-1",
      }),
    );
  });

  it("does not leak credentials in AwsRequestError.toJSON()", async () => {
    mockFetch.mockResolvedValue(new Response("error", { status: 403 }));

    const err = await awsRequest(ec2Request(), credentials).catch((e) => e);

    const payload = err.toJSON();
    expect(payload.code).toBe("aws_request_failed");
    expect(payload.message).toBe("AWS request failed.");
    expect(payload.retryable).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("AKIA");
    expect(JSON.stringify(payload)).not.toContain("test-secret");
  });

  it("constructs correct endpoint URL", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await awsRequest(
      logsRequest({
        region: "sa-east-1",
        path: "/filter",
      }),
      credentials,
    );

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe("https://logs.sa-east-1.amazonaws.com/filter");
  });
});
