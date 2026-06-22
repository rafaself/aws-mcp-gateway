import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  cwAlarmsResponse,
  logsDescribeLogGroupsResponse,
  makeLogGroup,
} from "../../test/fixtures.js";
import type { ToolPack } from "./manifest.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const singleRegionContext = createTestGatewayContext({
  allowedRegions: ["us-east-1"],
  toolExposure: {
    ...defaultResolvedToolExposure(),
    enabledToolPacks: new Set<ToolPack>([
      "core",
      "cost",
      "inventory",
      "observability",
      "aggregates",
    ]),
  },
});

interface CapturedTool {
  name: string;
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
      _c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) {
      return tools.find((t) => t.name === name);
    },
  };
}

function makeAlarm(): Record<string, unknown> {
  return {
    AlarmName: "HighCPU",
    StateValue: "ALARM",
    StateReason: "Threshold Crossed",
    StateUpdatedTimestamp: "2026-06-19T12:00:00.000Z",
    Namespace: "AWS/EC2",
    MetricName: "CPUUtilization",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("aws_observability_overview", () => {
  it("registers aws_observability_overview tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_observability_overview");
    expect(mock.getTool("aws_observability_overview")).toBeDefined();
  });

  it("returns bounded alarms overview by default", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(cwAlarmsResponse([makeAlarm()])));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_observability_overview");
    const result = (await mock.getTool("aws_observability_overview")!.handler({})) as Record<
      string,
      unknown
    >;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const structured = result.structuredContent as {
      regions: string[];
      alarms?: { count: number; sample: unknown[] };
      logGroups?: unknown;
    };
    expect(structured.regions).toEqual(["us-east-1"]);
    expect(structured.alarms?.count).toBe(1);
    expect(structured.alarms?.sample).toHaveLength(1);
    expect(structured.logGroups).toBeUndefined();
  });

  it("composes alarms and log groups when requested", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("monitoring")) {
        return Promise.resolve(cwAlarmsResponse([]));
      }
      return Promise.resolve(
        logsDescribeLogGroupsResponse([makeLogGroup({ logGroupName: "/aws/lambda/example" })]),
      );
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_observability_overview");
    const result = (await mock
      .getTool("aws_observability_overview")!
      .handler({ include: ["alarms", "logGroups"] })) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const structured = result.structuredContent as {
      alarms?: { count: number };
      logGroups?: { count: number; sample: Array<{ name: string; region: string }> };
    };
    expect(structured.alarms?.count).toBe(0);
    expect(structured.logGroups?.count).toBe(1);
    expect(structured.logGroups?.sample[0]).toEqual({
      name: "/aws/lambda/example",
      region: "us-east-1",
    });
  });

  it("returns validation_error for disallowed region before AWS calls", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_observability_overview");
    const result = (await mock
      .getTool("aws_observability_overview")!
      .handler({ regions: ["eu-central-1"] })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies calls when aggregates pack is disabled", async () => {
    const defaultContext = createTestGatewayContext();
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, defaultContext, "aws_observability_overview");
    const result = (await mock.getTool("aws_observability_overview")!.handler({})) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not fetch log events", async () => {
    mockFetch.mockImplementation((url: string, init?: { headers?: Record<string, string> }) => {
      const target = init?.headers?.["X-Amz-Target"] ?? "";
      expect(target).not.toContain("FilterLogEvents");
      if (url.includes("monitoring")) {
        return Promise.resolve(cwAlarmsResponse([]));
      }
      return Promise.resolve(logsDescribeLogGroupsResponse([]));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "aws_observability_overview");
    await mock
      .getTool("aws_observability_overview")!
      .handler({ include: ["alarms", "logGroups"] });
  });
});
