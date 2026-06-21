import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerToolByName } from "./index.js";
import { logsFilterEventsResponse } from "../../test/fixtures.js";

const { mockFetch } = vi.hoisted(() => {
  return { mockFetch: vi.fn() };
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
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
};

const singleRegionContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1"],
};

interface CapturedTool {
  name: string;
  config: unknown;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer(): {
  server: McpServer;
  getTool(name: string): CapturedTool | undefined;
} {
  const tools: CapturedTool[] = [];

  const server = {
    registerTool: (
      n: string,
      c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, config: c, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) { return tools.find((t) => t.name === name); },
  };
}

function makeLogEvent(opts?: {
  logStreamName?: string;
  timestamp?: number;
  message?: string;
}): Record<string, unknown> {
  return {
    logStreamName: opts?.logStreamName ?? "2026/06/19/[$LATEST]abcdef",
    timestamp: opts?.timestamp ?? 1718798400000,
    message: opts?.message ?? "ERROR: Example error message",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerGetRecentLogErrorsTool", () => {
  it("registers get_recent_log_errors tool", () => {
    const mock = makeMockServer();
    registerToolByName(mock.server, testContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("get_recent_log_errors");
  });

  it("includes description about CloudWatch log errors", () => {
    const mock = makeMockServer();
    registerToolByName(mock.server, testContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const cfg = tool.config as { description?: string };
    expect(cfg.description).toContain("error");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([makeLogEvent()])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 1,
      limit: 20,
    }) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 1 error log event(s) in /aws/lambda/example");

    expect(result.structuredContent).toEqual({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      count: 1,
      events: [
        {
          timestamp: "2024-06-19T12:00:00.000Z",
          logStreamName: "2026/06/19/[$LATEST]abcdef",
          message: "ERROR: Example error message",
        },
      ],
    });
  });

  it("returns empty events array when no matching logs", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toEqual({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      count: 0,
      events: [],
    });
  });

  it("passes hours parameter as time window", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 2,
    }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    const diffMs = body.endTime - body.startTime;
    const expectedDiffMs = 2 * 60 * 60 * 1000;
    expect(diffMs).toBeCloseTo(expectedDiffMs, -3);
  });

  it("passes limit parameter to AWS request", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      limit: 5,
    }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.limit).toBe(5);
  });

  it("returns isError for region not in allowlist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, testContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "eu-central-1",
      logGroupName: "/aws/lambda/example",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError for empty logGroupName", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, testContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("does not leak raw CloudWatch Logs response fields in MCP output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([makeLogEvent()])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
    }) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("eventId");
    expect(resultStr).not.toContain("ingestionTime");
  });

  it("does not call AWS when validation fails", async () => {
    const mock = makeMockServer();
    registerToolByName(mock.server, testContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;

    await tool.handler({
      region: "invalid-region",
      logGroupName: "/aws/lambda/example",
    }) as Record<string, unknown>;

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts hours of 24 (maximum)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 24,
    }) as Record<string, unknown>;

    expect(result.isError).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects hours exceeding maximum of 24", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 25,
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects hours below 1", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      hours: 0,
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts limit of 50 (maximum)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      limit: 50,
    }) as Record<string, unknown>;

    expect(result.isError).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects limit exceeding maximum of 50", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      limit: 51,
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects limit below 1", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsFilterEventsResponse([])),
    );

    const mock = makeMockServer();
    registerToolByName(mock.server, singleRegionContext, "get_recent_log_errors");
    const tool = mock.getTool("get_recent_log_errors")!;
    const result = await tool.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/example",
      limit: 0,
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
