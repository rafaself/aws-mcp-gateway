import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { GatewayError } from "../../errors/public-error.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const {
  getCostSummaryMock,
  getCostByServiceMock,
  listInstancesMock,
  listAlarmsMock,
  filterLogEventsMock,
} = vi.hoisted(() => ({
  getCostSummaryMock: vi.fn(),
  getCostByServiceMock: vi.fn(),
  listInstancesMock: vi.fn(),
  listAlarmsMock: vi.fn(),
  filterLogEventsMock: vi.fn(),
}));

vi.mock("../../aws/cost-explorer/index.js", () => ({
  getCostSummary: getCostSummaryMock,
  getCostByService: getCostByServiceMock,
}));

vi.mock("../../aws/ec2/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../aws/ec2/index.js")>();
  return {
    ...actual,
    listInstances: listInstancesMock,
  };
});

vi.mock("../../aws/cloudwatch/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../aws/cloudwatch/index.js")>();
  return {
    ...actual,
    listAlarms: listAlarmsMock,
  };
});

vi.mock("../../aws/logs/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../aws/logs/index.js")>();
  return {
    ...actual,
    filterLogEvents: filterLogEventsMock,
  };
});

type AuditEvent = {
  event: "mcp_tool_call";
  tool: string;
  outcome: "success" | "failure";
  durationMs: number;
  awsService?: string;
  region?: string;
  error?: { code: string; retryable: boolean };
  input?: Record<string, unknown>;
};

type CapturedTool = {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
};

function makeMockServer(): {
  server: McpServer;
  getTool(name: string): CapturedTool | undefined;
} {
  const tools: CapturedTool[] = [];

  const server = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name, handler });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    getTool(name: string) {
      return tools.find((tool) => tool.name === name);
    },
  };
}

function parseAuditEvent(spy: ReturnType<typeof vi.spyOn>): AuditEvent {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(spy.mock.calls[0][0] as string) as AuditEvent;
}

beforeEach(() => {
  vi.restoreAllMocks();
  getCostSummaryMock.mockReset();
  getCostByServiceMock.mockReset();
  listInstancesMock.mockReset();
  listAlarmsMock.mockReset();
  filterLogEventsMock.mockReset();
});

describe("public tool audit contract", () => {
  it("emits a stable success audit event for get_gateway_status", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_gateway_status");

    await mock.getTool("get_gateway_status")!.handler({});

    const event = parseAuditEvent(log);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_gateway_status",
      outcome: "success",
    });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.awsService).toBeUndefined();
    expect(event.region).toBeUndefined();
    expect(event.input).toBeUndefined();
  });

  it("emits a sanitized success audit event for get_aws_cost_summary", async () => {
    getCostSummaryMock.mockResolvedValue({
      period: { startDate: "2025-01-01", endDate: "2025-02-01" },
      total: 42.5,
      currency: "USD",
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");

    await mock.getTool("get_aws_cost_summary")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    const event = parseAuditEvent(log);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_aws_cost_summary",
      outcome: "success",
      awsService: "ce",
      region: "us-east-1",
      input: {
        hasDateRange: true,
        granularity: "MONTHLY",
      },
    });
    expect(JSON.stringify(event)).not.toContain("2025-01-01");
    expect(JSON.stringify(event)).not.toContain("2025-02-01");
  });

  it("emits a sanitized success audit event for get_aws_cost_by_service", async () => {
    getCostByServiceMock.mockResolvedValue({
      period: { startDate: "2025-01-01", endDate: "2025-02-01" },
      total: 42.5,
      currency: "USD",
      services: [{ service: "Amazon EC2", amount: 42.5 }],
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");

    await mock.getTool("get_aws_cost_by_service")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      limit: 5,
    });

    const event = parseAuditEvent(log);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_aws_cost_by_service",
      outcome: "success",
      awsService: "ce",
      region: "us-east-1",
      input: {
        hasDateRange: true,
        granularity: "MONTHLY",
        limit: 5,
      },
    });
    expect(JSON.stringify(event)).not.toContain("2025-01-01");
  });

  it("emits a sanitized success audit event for list_ec2_instances", async () => {
    listInstancesMock.mockResolvedValue([
      {
        instanceId: "i-1234567890",
        region: "us-east-1",
        state: "running",
        instanceType: "t3.micro",
        name: "web",
      },
    ]);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_ec2_instances");

    await mock.getTool("list_ec2_instances")!.handler({
      regions: ["us-east-1", "us-west-2"],
      states: ["running"],
    });

    const event = parseAuditEvent(log);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "list_ec2_instances",
      outcome: "success",
      awsService: "ec2",
      input: {
        regionCount: 2,
        stateFilter: ["running"],
      },
    });
    expect(event.region).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("us-west-2");
  });

  it("emits a sanitized success audit event for get_cloudwatch_alarms", async () => {
    listAlarmsMock.mockResolvedValue([
      {
        name: "HighCPU",
        region: "us-east-1",
        state: "ALARM",
        reason: "Threshold Crossed",
        updatedAt: "2026-06-19T12:00:00.000Z",
      },
    ]);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_cloudwatch_alarms");

    await mock.getTool("get_cloudwatch_alarms")!.handler({
      regions: ["us-east-1", "us-west-2"],
      states: ["ALARM"],
    });

    const event = parseAuditEvent(log);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_cloudwatch_alarms",
      outcome: "success",
      awsService: "monitoring",
      input: {
        regionCount: 2,
        stateFilter: ["ALARM"],
      },
    });
    expect(event.region).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("HighCPU");
  });

  it("emits a sanitized validation failure audit event for get_recent_log_errors", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_recent_log_errors");

    await mock.getTool("get_recent_log_errors")!.handler({
      region: "us-east-1",
      logGroupName: "",
      hours: 24,
      limit: 50,
    });

    const event = parseAuditEvent(log);
    expect(error).not.toHaveBeenCalled();
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_recent_log_errors",
      outcome: "failure",
      awsService: "logs",
      region: "us-east-1",
      error: {
        code: "validation_error",
        retryable: false,
      },
      input: {
        hasLogGroupName: true,
        hours: 24,
        limit: 50,
      },
    });
    const line = JSON.stringify(event);
    expect(line).not.toContain("logGroupName");
    expect(line).not.toContain("/aws/lambda");
  });

  it("emits a sanitized AWS failure audit event for get_recent_log_errors", async () => {
    filterLogEventsMock.mockRejectedValue(
      new GatewayError("aws_request_failed", "AWS request failed.", false),
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_recent_log_errors");

    await mock.getTool("get_recent_log_errors")!.handler({
      region: "us-east-1",
      logGroupName: "/aws/lambda/private-service",
      hours: 24,
      limit: 50,
    });

    expect(log).not.toHaveBeenCalled();
    const event = parseAuditEvent(error);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "get_recent_log_errors",
      outcome: "failure",
      awsService: "logs",
      region: "us-east-1",
      error: {
        code: "aws_request_failed",
        retryable: false,
      },
      input: {
        hasLogGroupName: true,
        hours: 24,
        limit: 50,
      },
    });
    const line = JSON.stringify(event);
    expect(line).not.toContain("/aws/lambda/private-service");
  });
});
