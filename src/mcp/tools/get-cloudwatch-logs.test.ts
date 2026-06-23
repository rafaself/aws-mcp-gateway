import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  logsDescribeLogStreamsResponse,
  logsFilterEventsResponse,
} from "../../test/fixtures.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

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

const testContext = createTestGatewayContext();
const singleRegionContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

interface CapturedTool {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer(): { server: McpServer; getTool(name: string): CapturedTool | undefined } {
  const tools: CapturedTool[] = [];
  const server = {
    registerTool: (
      n: string,
      _c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;
  return {
    server,
    getTool(name: string) { return tools.find((t) => t.name === name); },
  };
}

function makeLogEvent(message = "INFO request completed"): Record<string, unknown> {
  return {
    logStreamName: "2026/06/19/[$LATEST]abcdef",
    timestamp: 1718798400000,
    message,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_cloudwatch_logs tool", () => {
  it("returns bounded, redacted log events", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsFilterEventsResponse([
          makeLogEvent("failed password=supersecret for user"),
        ]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_logs");
    const result = await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/aws/lambda/example",
      region: "us-east-1",
      lookbackMinutes: 30,
      limit: 10,
    }) as Record<string, unknown>;

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.count).toBe(1);
    expect(structured.lookbackMinutes).toBe(30);
    expect(structured.truncated).toBe(false);
    const events = structured.events as Array<{ message: string }>;
    expect(events[0].message).toContain("password=[REDACTED]");
    expect(events[0].message).not.toContain("supersecret");
  });

  it("uses empty filter pattern by default", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(logsFilterEventsResponse([])));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_logs");
    await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/aws/lambda/example",
      region: "us-east-1",
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.filterPattern).toBe("");
  });

  it("sets truncated when limit is reached", async () => {
    const events = Array.from({ length: 5 }, () => makeLogEvent());
    mockFetch.mockImplementation(() => Promise.resolve(logsFilterEventsResponse(events)));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_logs");
    const result = await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/aws/lambda/example",
      region: "us-east-1",
      limit: 5,
    }) as Record<string, unknown>;

    expect((result.structuredContent as { truncated: boolean }).truncated).toBe(true);
  });

  it("returns empty result when stream prefix matches no streams", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsDescribeLogStreamsResponse([])),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_logs");
    const result = await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/aws/lambda/example",
      region: "us-east-1",
      logStreamNamePrefix: "missing/",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      count: 0,
      events: [],
      truncated: false,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects region outside allowlist without calling AWS", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_cloudwatch_logs");
    const result = await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/aws/lambda/example",
      region: "eu-west-1",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("maps missing log group to not_found", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 400 })),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_logs");
    const result = await mock.getTool("get_cloudwatch_logs")!.handler({
      logGroupName: "/missing/group",
      region: "us-east-1",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });
});
