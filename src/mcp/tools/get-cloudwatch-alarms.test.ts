import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerGetCloudwatchAlarmsTool } from "./get-cloudwatch-alarms.js";
import { cwAlarmsResponse } from "../../test/fixtures.js";

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

function makeAlarm(opts?: {
  name?: string;
  state?: string;
  reason?: string;
  updatedAt?: string;
}): Record<string, unknown> {
  return {
    AlarmName: opts?.name ?? "HighCPU",
    StateValue: opts?.state ?? "ALARM",
    StateReason: opts?.reason ?? "Threshold Crossed",
    StateUpdatedTimestamp: opts?.updatedAt ?? "2026-06-19T12:00:00.000Z",
    Namespace: "AWS/EC2",
    MetricName: "CPUUtilization",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerGetCloudwatchAlarmsTool", () => {
  it("registers get_cloudwatch_alarms tool", () => {
    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("get_cloudwatch_alarms");
  });

  it("includes description about CloudWatch alarms", () => {
    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const cfg = tool.config as { description?: string };
    expect(cfg.description).toContain("CloudWatch alarms");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([makeAlarm()])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 1 alarm(s) across 1 region(s).");

    expect(result.structuredContent).toEqual({
      regions: ["us-east-1"],
      count: 1,
      alarms: [
        {
          name: "HighCPU",
          region: "us-east-1",
          state: "ALARM",
          reason: "Threshold Crossed",
          updatedAt: "2026-06-19T12:00:00.000Z",
        },
      ],
    });
  });

  it("returns alarms from multiple regions", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("us-west-2")) {
        return Promise.resolve(
          cwAlarmsResponse([makeAlarm({ name: "CPU-West" })]),
        );
      }
      return Promise.resolve(
        cwAlarmsResponse([makeAlarm({ name: "CPU-East" })]),
      );
    });

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const structured = result.structuredContent as {
      regions: string[];
      count: number;
      alarms: Array<{ name: string; region: string }>;
    };
    expect(structured.regions).toEqual(["us-east-1", "us-west-2"]);
    expect(structured.count).toBe(2);
    expect(structured.alarms).toHaveLength(2);

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 2 alarm(s) across 2 region(s).");
  });

  it("returns empty result when no alarms exist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result.structuredContent).toEqual({
      regions: ["us-east-1"],
      count: 0,
      alarms: [],
    });

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("Found 0 alarm(s) across 1 region(s).");
  });

  it("filters by regions when provided", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    await tool.handler({ regions: ["us-east-1"] }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0][0] as string;
    expect(callArgs).toContain("us-east-1");
  });

  it("filters by states when provided", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    await tool.handler({ states: ["ALARM"] }) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse((callArgs[1] as { body?: string }).body ?? "{}");
    expect(body.StateValue).toBe("ALARM");
  });

  it("returns isError for invalid state", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({ states: ["INVALID"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError for region not in allowlist", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, testContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({ regions: ["eu-central-1"] }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("does not leak raw CloudWatch response fields in MCP output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(cwAlarmsResponse([makeAlarm()])),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("AlarmName");
    expect(resultStr).not.toContain("StateValue");
    expect(resultStr).not.toContain("StateReason");
    expect(resultStr).not.toContain("StateUpdatedTimestamp");
    expect(resultStr).not.toContain("Namespace");
    expect(resultStr).not.toContain("MetricName");
  });

  it("shows active alarms first in text output", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([
          makeAlarm({ name: "B-Ok", state: "OK" }),
          makeAlarm({ name: "A-Alarm", state: "ALARM" }),
          makeAlarm({ name: "C-Insufficient", state: "INSUFFICIENT_DATA" }),
        ]),
      ),
    );

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    const structured = result.structuredContent as {
      alarms: Array<{ name: string; state: string }>;
    };
    expect(structured.alarms[0].state).toBe("ALARM");
    expect(structured.alarms[1].state).toBe("INSUFFICIENT_DATA");
    expect(structured.alarms[2].state).toBe("OK");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    const alarmIdx = content.text.indexOf("ALARM (1):");
    const insufficientIdx = content.text.indexOf("INSUFFICIENT_DATA (1):");
    const okIdx = content.text.indexOf("OK (1):");

    expect(alarmIdx).toBeGreaterThan(-1);
    expect(insufficientIdx).toBeGreaterThan(-1);
    expect(okIdx).toBeGreaterThan(-1);
    expect(alarmIdx).toBeLessThan(insufficientIdx);
    expect(insufficientIdx).toBeLessThan(okIdx);
  });

  it("returns normalized error when all regions fail", async () => {
    mockFetch.mockRejectedValue(new Error("CloudWatch down"));

    const mock = makeMockServer();
    registerGetCloudwatchAlarmsTool(mock.server, singleRegionContext);
    const tool = mock.getTool("get_cloudwatch_alarms")!;
    const result = await tool.handler({}) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "aws_request_failed", retryable: false },
    });
  });
});
