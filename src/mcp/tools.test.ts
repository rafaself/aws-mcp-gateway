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

function makeMockServerWithCapture(): {
  server: McpServer;
  readonly capturedName: string | undefined;
  readonly capturedConfig: unknown;
  readonly capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
} {
  let name: string | undefined;
  let config: unknown;
  let handler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

  const server = {
    registerTool: (
      n: string,
      c: unknown,
      h: (args: Record<string, unknown>) => Promise<unknown>,
    ) => {
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

    expect(mock.capturedName).toBe("get_aws_cost_summary");
    expect(mock.capturedHandler).toBeDefined();
  });

  it("includes description about AWS cost", () => {
    const mock = makeMockServerWithCapture();

    registerCostTools(mock.server, testContext);

    const cfg = mock.capturedConfig as { description?: string };
    expect(cfg.description).toContain("AWS cost");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);

    const result = await mock.capturedHandler!({
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
    const result = await mock.capturedHandler!({
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

  it("returns isError true with structuredContent.error when date range exceeds 90 days", async () => {
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

  it("returns isError true with structuredContent.error when startDate is after endDate", async () => {
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

  it("calls AWS via getCostSummary passed credentials", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    const mock = makeMockServerWithCapture();
    registerCostTools(mock.server, testContext);
    await mock.capturedHandler!({
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
    await mock.capturedHandler!({
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
    await mock.capturedHandler!({
      startDate: "2030-01-01",
      endDate: "2030-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
