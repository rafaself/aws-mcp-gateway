import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { ceResponse, makeDayTotal } from "../../test/fixtures.js";

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

const testContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

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

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerCostSummaryTool", () => {
  it("registers get_aws_cost_summary tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("get_aws_cost_summary");
  });

  it("includes description about AWS cost", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const cfg = tool.config as { description?: string };
    expect(cfg.description).toContain("AWS cost");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
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

    expect(result.structuredContent).toMatchObject({
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "01-01-2025",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError true with structuredContent.error when date range exceeds 90 days", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-05-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError true with structuredContent.error when startDate is after endDate", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-02-01",
      endDate: "2025-01-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("calls AWS via getCostSummary passed credentials", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    await tool.handler({
      startDate: "2030-01-01",
      endDate: "2030-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("works with cache binding present (no error)", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    const mockKv = {
      get: vi.fn(async () => null),
      put: vi.fn(),
    } as never;

    const ctxWithCache: GatewayContext = {
      ...testContext,
      cache: mockKv,
    };

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result).toHaveProperty("structuredContent");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a 90-day date range as valid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-04-01", "50.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-04-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      period: { startDate: "2025-01-01", endDate: "2025-04-01" },
      granularity: "MONTHLY",
      total: 50,
      currency: "USD",
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("AWS cost from 2025-01-01 to 2025-04-01 is 50 USD");
  });

  it("rejects date range exceeding 90-day maximum", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-04-02", "50.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-04-02",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw Cost Explorer response fields in MCP output", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("ResultsByTime");
    expect(resultStr).not.toContain("TimePeriod");
    expect(resultStr).not.toContain("UnblendedCost");
  });

  it("returns normalized error when AWS request fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
    const tool = mock.getTool("get_aws_cost_summary")!;
    const result = await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "aws_request_failed", retryable: false },
    });
    expect(result.structuredContent).not.toHaveProperty("execution");
  });

  describe("execution metadata", () => {
    it("reports cache hit with zero AWS requests", async () => {
      const cachedSummary = {
        period: { startDate: "2025-01-01", endDate: "2025-02-01" },
        currency: "USD",
        total: 99,
      };

      const mockKv = {
        get: vi.fn(async () => cachedSummary),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_summary");
      const tool = mock.getTool("get_aws_cost_summary")!;
      const result = await tool.handler({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown> };

      const execution = result.structuredContent.execution as {
        cache: { status: string };
        awsRequestCount: number;
        billing: { charged: boolean };
      };

      expect(execution.cache.status).toBe("hit");
      expect(execution.awsRequestCount).toBe(0);
      expect(execution.billing.charged).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("reports cache miss with AWS request telemetry and billing charge", async () => {
      mockFetch.mockResolvedValue(
        ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "42.50")]),
      );

      const mockKv = {
        get: vi.fn(async () => null),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_summary");
      const tool = mock.getTool("get_aws_cost_summary")!;
      const result = await tool.handler({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown> };

      const execution = result.structuredContent.execution as {
        cache: { status: string };
        awsRequestCount: number;
        billing: { charged: boolean; estimatedCostUsd: number };
        awsRequests: Array<{ action: string; requestCount: number }>;
      };

      expect(execution.cache.status).toBe("miss");
      expect(execution.awsRequestCount).toBe(1);
      expect(execution.billing.charged).toBe(true);
      expect(execution.billing.estimatedCostUsd).toBe(0.01);
      expect(execution.awsRequests[0]).toMatchObject({
        action: "ce:GetCostAndUsage",
        requestCount: 1,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("reports cache disabled when KV binding is absent", async () => {
      mockFetch.mockResolvedValue(
        ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
      );

      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, testContext, "get_aws_cost_summary");
      const tool = mock.getTool("get_aws_cost_summary")!;
      const result = await tool.handler({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown> };

      const execution = result.structuredContent.execution as {
        cache: { status: string };
        awsRequestCount: number;
      };

      expect(execution.cache.status).toBe("disabled");
      expect(execution.awsRequestCount).toBe(1);
    });

    it("reports cache unavailable when KV read fails but still returns live data", async () => {
      mockFetch.mockResolvedValue(
        ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "15.00")]),
      );

      const mockKv = {
        get: vi.fn(async () => {
          throw new Error("KV unavailable");
        }),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_summary");
      const tool = mock.getTool("get_aws_cost_summary")!;
      const result = await tool.handler({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown> };

      const execution = result.structuredContent.execution as {
        cache: { status: string };
        awsRequestCount: number;
      };

      expect(execution.cache.status).toBe("unavailable");
      expect(execution.awsRequestCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
