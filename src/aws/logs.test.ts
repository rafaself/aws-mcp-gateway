import { describe, it, expect, vi, beforeEach } from "vitest";
import { filterLogEvents } from "./logs.js";
import { LogsError } from "./logs-types.js";
import { buildCacheKey } from "../cache/keys.js";
import { logsFilterEventsResponse } from "../test/fixtures.js";
import type { AwsCredentials } from "./types.js";

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

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

const TEST_TIMESTAMP_MS = 1718798400000;
const TEST_TIMESTAMP_ISO = "2024-06-19T12:00:00.000Z";

function makeEvent(opts?: {
  logStreamName?: string;
  timestamp?: number;
  message?: string;
}): Record<string, unknown> {
  return {
    logStreamName: opts?.logStreamName ?? "2026/06/19/[$LATEST]abcdef",
    timestamp: opts?.timestamp ?? TEST_TIMESTAMP_MS,
    message: opts?.message ?? "ERROR: Example error message",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("filterLogEvents", () => {
  it("returns normalized log events from API response", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsFilterEventsResponse([makeEvent()]),
      ),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      logGroupName: "/aws/lambda/example",
      logStreamName: "2026/06/19/[$LATEST]abcdef",
      timestamp: TEST_TIMESTAMP_ISO,
      message: "ERROR: Example error message",
      region: "us-east-1",
    });
  });

  it("uses default error filter pattern when none provided", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.filterPattern).toBe(
      "?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn",
    );
  });

  it("uses provided filter pattern instead of default", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents(
      "/aws/lambda/example",
      { filterPattern: "?CRITICAL" },
      "us-east-1",
      credentials,
    );

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.filterPattern).toBe("?CRITICAL");
  });

  it("rejects empty log group name", async () => {
    await expect(
      filterLogEvents("", {}, "us-east-1", credentials),
    ).rejects.toThrow(LogsError);

    await expect(
      filterLogEvents("   ", {}, "us-east-1", credentials),
    ).rejects.toThrow(LogsError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects time range exceeding 24 hours", async () => {
    const now = Date.now();
    const farPast = now - 25 * 60 * 60 * 1000;

    await expect(
      filterLogEvents(
        "/aws/lambda/example",
        { startTime: farPast, endTime: now },
        "us-east-1",
        credentials,
      ),
    ).rejects.toThrow(LogsError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects startTime >= endTime", async () => {
    const now = Date.now();

    await expect(
      filterLogEvents(
        "/aws/lambda/example",
        { startTime: now, endTime: now },
        "us-east-1",
        credentials,
      ),
    ).rejects.toThrow(LogsError);

    await expect(
      filterLogEvents(
        "/aws/lambda/example",
        { startTime: now, endTime: now - 1000 },
        "us-east-1",
        credentials,
      ),
    ).rejects.toThrow(LogsError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("truncates messages longer than 1000 characters", async () => {
    const longMessage = "x".repeat(1500);
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsFilterEventsResponse([makeEvent({ message: longMessage })]),
      ),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0].message.length).toBe(1_000);
    expect(result[0].message).toBe("x".repeat(997) + "...");
  });

  it("does not truncate messages at or under 1000 characters", async () => {
    const shortMessage = "x".repeat(1000);
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsFilterEventsResponse([makeEvent({ message: shortMessage })]),
      ),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result[0].message).toBe(shortMessage);
  });

  it("sends correct X-Amz-Target header", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const headers = (mockFetch.mock.calls[0][1] as { headers?: Record<string, string> }).headers ?? {};
    expect(headers["X-Amz-Target"]).toBe("Logs_20140328.FilterLogEvents");
  });

  it("sends limit: 50 in request body", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.limit).toBe(50);
  });

  it("handles empty events response gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toEqual([]);
  });

  it("handles response with no events field", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ nextToken: "abc" }), {
          status: 200,
          headers: { "content-type": "application/x-amz-json-1.1" },
        }),
      ),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toEqual([]);
  });

  it("passes credentials to AwsClient constructor", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials);

    expect(awsClientConstructors).toHaveLength(1);
    expect(awsClientConstructors[0]).toMatchObject({
      accessKeyId: "AKIA-test-key",
      secretAccessKey: "test-secret",
      service: "logs",
      region: "us-east-1",
    });
  });

  it("sends logGroupName in request body", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents(
      "/aws/lambda/my-app",
      {},
      "us-east-1",
      credentials,
    );

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.logGroupName).toBe("/aws/lambda/my-app");
  });

  it("does not leak raw response fields in output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsFilterEventsResponse([makeEvent()]),
      ),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(1);
    const keys = Object.keys(result[0]);
    expect(keys).not.toContain("eventId");
    expect(keys).not.toContain("ingestionTime");
  });

  it("caps returned events at 50", async () => {
    const manyEvents = Array.from({ length: 75 }, (_, i) =>
      makeEvent({ logStreamName: `stream-${i}`, message: `Event ${i}` }),
    );
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse(manyEvents)),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(50);
  });

  it("uses custom limit when provided", async () => {
    const manyEvents = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ logStreamName: `stream-${i}`, message: `Event ${i}` }),
    );
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse(manyEvents)),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      { limit: 3 },
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(3);
  });

  it("sends custom limit in request body", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    await filterLogEvents(
      "/aws/lambda/example",
      { limit: 10 },
      "us-east-1",
      credentials,
    );

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.limit).toBe(10);
  });

  it("rejects limit below 1", async () => {
    await expect(
      filterLogEvents(
        "/aws/lambda/example",
        { limit: 0 },
        "us-east-1",
        credentials,
      ),
    ).rejects.toThrow(LogsError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects limit above 50", async () => {
    await expect(
      filterLogEvents(
        "/aws/lambda/example",
        { limit: 51 },
        "us-east-1",
        credentials,
      ),
    ).rejects.toThrow(LogsError);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

function createMockKv(): { store: Map<string, string>; get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>();

  const get = vi.fn(async (key: string, _type?: string) => {
    const raw = store.get(key);
    if (raw === undefined) return null;
    return JSON.parse(raw);
  });

  const put = vi.fn(
    async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value);
    },
  );

  return { store, get, put };
}

const DEFAULT_FILTER_PATTERN = "?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn";

describe("filterLogEvents with cache", () => {
  it("returns cached result without calling AWS on cache hit", async () => {
    const cache = createMockKv();
    const cachedResult = [
      {
        logGroupName: "/aws/lambda/example",
        logStreamName: "stream-1",
        timestamp: TEST_TIMESTAMP_ISO,
        message: "Cached error",
        region: "us-east-1",
      },
    ];
    const startTime = TEST_TIMESTAMP_MS - 3600000;
    const endTime = TEST_TIMESTAMP_MS;
    const limit = 50;

    const key = await buildCacheKey("get_recent_log_errors", {
      logGroupName: "/aws/lambda/example",
      region: "us-east-1",
      filterPattern: DEFAULT_FILTER_PATTERN,
      startTime,
      endTime,
      limit,
    });
    cache.store.set(key, JSON.stringify(cachedResult));

    const result = await filterLogEvents(
      "/aws/lambda/example",
      { startTime, endTime },
      "us-east-1",
      credentials,
      cache as never,
    );

    expect(result).toEqual(cachedResult);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls AWS and stores result on cache miss", async () => {
    const cache = createMockKv();
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([makeEvent()])),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
      cache as never,
    );

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });

  it("does not cache when AWS call fails", async () => {
    const cache = createMockKv();
    mockFetch.mockRejectedValue(new Error("Network error"));

    await expect(
      filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials, cache as never),
    ).rejects.toThrow();

    expect(cache.put).not.toHaveBeenCalled();
  });

  it("works when cache binding is absent", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([makeEvent()])),
    );

    const result = await filterLogEvents(
      "/aws/lambda/example",
      {},
      "us-east-1",
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("reuses cache for default recent log window within the TTL bucket", async () => {
    vi.setSystemTime(new Date("2026-06-19T12:01:30.000Z"));

    const cache = createMockKv();
    mockFetch.mockResolvedValue(logsFilterEventsResponse([makeEvent()]));

    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials, cache as never);
    await filterLogEvents("/aws/lambda/example", {}, "us-east-1", credentials, cache as never);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
