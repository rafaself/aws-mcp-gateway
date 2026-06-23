import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { cwAlarmsResponse } from "../../test/fixtures.js";

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

function makeAlarm(opts?: {
  name?: string;
  state?: string;
  reason?: string;
}): Record<string, unknown> {
  return {
    AlarmName: opts?.name ?? "HighCPU",
    StateValue: opts?.state ?? "ALARM",
    StateReason:
      opts?.reason ??
      "Threshold Crossed: 1 datapoint was greater than the threshold. arn:aws:sns:us-east-1:123456789012:ops",
    StateUpdatedTimestamp: "2026-06-19T12:00:00.000Z",
    Namespace: "AWS/EC2",
    MetricName: "CPUUtilization",
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_cloudwatch_alarm_summary tool", () => {
  it("returns grouped state counts and alarm details", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        cwAlarmsResponse([
          makeAlarm({ name: "CPU-High", state: "ALARM" }),
          makeAlarm({ name: "Disk-OK", state: "OK", reason: "Within threshold" }),
        ]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_alarm_summary");
    const result = await mock.getTool("get_cloudwatch_alarm_summary")!.handler({
      region: "us-east-1",
      limit: 10,
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      region: "us-east-1",
      count: 2,
      stateCounts: {
        ALARM: 1,
        OK: 1,
        INSUFFICIENT_DATA: 0,
      },
    });

    const alarms = (result.structuredContent as { alarms: Array<Record<string, string>> }).alarms;
    expect(alarms[0]).toMatchObject({
      name: "CPU-High",
      state: "ALARM",
      metricNamespace: "AWS/EC2",
      metricName: "CPUUtilization",
    });
    expect(alarms[0].reason).not.toContain("arn:aws:sns");
    expect(alarms[0].reason).toContain("[REDACTED_ARN]");
  });

  it("passes alarm name prefix to DescribeAlarms", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(cwAlarmsResponse([])));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_alarm_summary");
    await mock.getTool("get_cloudwatch_alarm_summary")!.handler({
      region: "us-east-1",
      alarmNamePrefix: "prod-",
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body?: string }).body ?? "{}",
    );
    expect(body.AlarmNamePrefix).toBe("prod-");
  });

  it("returns empty summary for prefix with no matches", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(cwAlarmsResponse([])));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_cloudwatch_alarm_summary");
    const result = await mock.getTool("get_cloudwatch_alarm_summary")!.handler({
      region: "us-east-1",
      alarmNamePrefix: "missing-",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      count: 0,
      stateCounts: { ALARM: 0, OK: 0, INSUFFICIENT_DATA: 0 },
      alarms: [],
    });
  });

  it("rejects region outside allowlist without calling AWS", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_cloudwatch_alarm_summary");
    const result = await mock.getTool("get_cloudwatch_alarm_summary")!.handler({
      region: "eu-west-1",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
