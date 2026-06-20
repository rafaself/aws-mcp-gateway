import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiagnosticTools, registerCostTools, type GatewayContext } from "./tools.js";

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
  allowedRegions: ["us-east-1"],
};

interface CapturedTool {
  name: string;
  config: unknown;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServerWithCapture(): {
  server: McpServer;
  readonly capturedName: string | undefined;
  readonly capturedConfig: unknown;
  readonly capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
  getTool(name: string): CapturedTool | undefined;
} {
  const tools: CapturedTool[] = [];
  let name: string | undefined;
  let config: unknown;
  let handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

  const server = {
    registerTool: (
      n: string,
      c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({ name: n, config: c, handler: h });
      name = n;
      config = c;
      handler = h;
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  return {
    server,
    get capturedName() { return name; },
    get capturedConfig() { return config; },
    get capturedHandler() { return handler; },
    getTool(name: string) { return tools.find((t) => t.name === name); },
  };
}

function ceResponse(resultsByTime: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ ResultsByTime: resultsByTime }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

function makeDayTotal(
  start: string,
  end: string,
  amount: string,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: amount, Unit: unit } },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerDiagnosticTools", () => {
  it("registers get_gateway_status tool with handler returning static read-only gateway status", async () => {
    let capturedName: string | undefined;
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

    const mockServer = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (args: Record<string, unknown>) => Promise<unknown>,
      ) => {
        capturedName = name;
        capturedHandler = handler;
        return {} as ReturnType<McpServer["registerTool"]>;
      },
    } as McpServer;

    registerDiagnosticTools(mockServer);

    expect(capturedName).toBe("get_gateway_status");
    expect(capturedHandler).toBeDefined();

    const result = await capturedHandler!({}) as { content: Array<{ type: string; text: string }> };

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            service: "aws-mcp-gateway",
            status: "ok",
            mode: "read-only",
          }),
        },
      ],
    });
  });
});

describe("registerCostTools", () => {
  it("registers get_aws_cost_summary tool", () => {
    const mock = makeMockServerWithCapture();

    registerCostTools(mock.server, testContext);

    const tool = mock.getTool("get_aws_cost_summary");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("get_aws_cost_summary");
  });

  it("includes description about AWS cost", () => {
    const mock = makeMockServerWithCapture();

    registerCostTools(mock.server, testContext);

    const tool = mock.getTool("get_aws_cost_summary")!;
    const cfg = tool.config as { description?: string };
    expect(cfg.description).toContain("AWS cost");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);

    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toBe("AWS cost from 2025-01-01 to 2025-02-01 is 42.5 USD.");

    expect(result.structuredContent).toEqual({
      period: { startDate: "2025-01-01", endDate: "2025-02-01" },
      granularity: "MONTHLY",
      total: 42.5,
      currency: "USD",
    });
  });

  it("passes granularity from args to structuredContent", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-01-02", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      granularity: "DAILY",
    }) as Record<string, unknown>;

    expect((result.structuredContent as Record<string, unknown>).granularity).toBe("DAILY");
  });

  it("returns isError true with structuredContent.error when date format is invalid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "01-01-2025",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "invalid_date_format", retryable: false },
    });
  });

  it("returns isError true with structuredContent.error when date range exceeds 90 days", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-05-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "date_range_exceeded", retryable: false },
    });
  });

  it("returns isError true with structuredContent.error when startDate is after endDate", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-02-01",
      endDate: "2025-01-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "invalid_date_range", retryable: false },
    });
  });

  it("calls AWS via getCostSummary passed credentials", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "DAILY",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  it("does not call AWS when date format is invalid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    await tool.handler({
      startDate: "invalid",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not call AWS when future date is used", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2030-01-01", "2030-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const tool = mock.getTool("get_aws_cost_summary")!;
    await tool.handler({
      startDate: "2030-01-01",
      endDate: "2030-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("registerCostTools - get_aws_cost_by_service", () => {
  function makeDayWithGroups(
    start: string,
    end: string,
    totalAmount: string,
    groups: Array<{ key: string; amount: string }>,
    unit = "USD",
    metric = "UnblendedCost",
  ) {
    return {
      TimePeriod: { Start: start, End: end },
      Total: { [metric]: { Amount: totalAmount, Unit: unit } },
      Groups: groups.map((g) => ({
        Keys: [g.key],
        Metrics: { [metric]: { Amount: g.amount, Unit: unit } },
      })),
    };
  }

  it("registers get_aws_cost_by_service tool", () => {
    const mock = makeMockServerWithCapture();

    registerCostTools(mock.server, testContext);

    expect(mock.capturedName).toBe("get_aws_cost_by_service");
    expect(mock.capturedHandler).toBeDefined();
  });

  it("includes description about cost broken down by service", () => {
    const mock = makeMockServerWithCapture();

    registerCostTools(mock.server, testContext);

    const cfg = mock.capturedConfig as { description?: string };
    expect(cfg.description).toContain("broken down by service");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "150.00", [
          { key: "Amazon EC2", amount: "100.00" },
          { key: "Amazon S3", amount: "50.00" },
        ]),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);

    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      limit: 10,
    }) as Record<string, unknown>;

    expect(result).toHaveProperty("content");
    expect(result).toHaveProperty("structuredContent");

    const content = (result.content as Array<{ type: string; text: string }>)[0];
    expect(content.text).toContain("AWS cost from 2025-01-01 to 2025-02-01 is 150 USD");
    expect(content.text).toContain("Amazon EC2: 100.00 USD");
    expect(content.text).toContain("Amazon S3: 50.00 USD");

    expect(result.structuredContent).toEqual({
      period: { startDate: "2025-01-01", endDate: "2025-02-01" },
      granularity: "MONTHLY",
      total: 150,
      currency: "USD",
      services: [
        { service: "Amazon EC2", amount: 100 },
        { service: "Amazon S3", amount: 50 },
      ],
    });
  });

  it("passes granularity from args to structuredContent", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-01-02", "10.00", [
          { key: "Amazon S3", amount: "10.00" },
        ]),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      granularity: "DAILY",
    }) as Record<string, unknown>;

    expect((result.structuredContent as Record<string, unknown>).granularity).toBe("DAILY");
  });

  it("defaults granularity to MONTHLY when omitted", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "10.00", [
          { key: "Amazon S3", amount: "10.00" },
        ]),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect((result.structuredContent as Record<string, unknown>).granularity).toBe("MONTHLY");
  });

  it("defaults limit to 10 when omitted", async () => {
    const groups = Array.from({ length: 15 }, (_, i) => ({
      key: `Service ${i + 1}`,
      amount: `${(i + 1) * 10}.00`,
    }));

    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "1200.00", groups),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      limit: 10,
    }) as Record<string, unknown>;

    const services = (result.structuredContent as Record<string, unknown>).services as Array<{ service: string; amount: number }>;
    expect(services).toHaveLength(10);
  });

  it("respects limit up to 25", async () => {
    const groups = Array.from({ length: 30 }, (_, i) => ({
      key: `Service ${i + 1}`,
      amount: `${(i + 1) * 10}.00`,
    }));

    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "4650.00", groups),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      limit: 25,
    }) as Record<string, unknown>;

    const services = (result.structuredContent as Record<string, unknown>).services as Array<{ service: string; amount: number }>;
    expect(services).toHaveLength(25);
  });

  it("sorts services by amount descending", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "200.00", [
          { key: "Amazon S3", amount: "30.00" },
          { key: "Amazon EC2", amount: "100.00" },
          { key: "AWS Lambda", amount: "70.00" },
        ]),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    const services = (result.structuredContent as Record<string, unknown>).services as Array<{ service: string; amount: number }>;
    const amounts = services.map((s) => s.amount);
    expect(amounts).toEqual([100, 70, 30]);
  });

  it("returns isError true with structuredContent.error when date format is invalid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "01-01-2025",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "invalid_date_format", retryable: false },
    });
  });

  it("returns isError true when date range exceeds 90 days", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-05-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "date_range_exceeded", retryable: false },
    });
  });

  it("returns isError true when startDate is after endDate", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-02-01",
      endDate: "2025-01-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "invalid_date_range", retryable: false },
    });
  });

  it("does not call AWS when date format is invalid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    await mock.capturedHandler!({
      startDate: "invalid",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw AWS Cost Explorer response in MCP output", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "150.00", [
          { key: "Amazon EC2", amount: "100.00" },
        ]),
      ]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("ResultsByTime");
    expect(resultStr).not.toContain("TimePeriod");
    expect(resultStr).not.toContain("UnblendedCost");
  });
});
