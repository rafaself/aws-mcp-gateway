import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { ceResponse, makeDayTotal, makeDayWithGroups } from "../../test/fixtures.js";

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

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerCostByServiceTool", () => {
  it("registers get_aws_cost_by_service tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    expect(mock.capturedName).toBe("get_aws_cost_by_service");
    expect(mock.capturedHandler).toBeDefined();
  });

  it("includes description about cost broken down by service", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");

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

    expect(result.structuredContent).toMatchObject({
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
      startDate: "01-01-2025",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError true when date range exceeds 90 days", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-05-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns isError true when startDate is after endDate", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
      startDate: "2025-02-01",
      endDate: "2025-01-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("does not call AWS when date format is invalid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
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

  it("works with cache binding present (no error)", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "100.00", [
          { key: "Amazon S3", amount: "100.00" },
        ]),
      ]),
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
    registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result).toHaveProperty("structuredContent");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a 90-day date range as valid", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-04-01", "50.00", [
          { key: "Amazon EC2", amount: "50.00" },
        ]),
      ]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
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
      services: [{ service: "Amazon EC2", amount: 50 }],
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("AWS cost from 2025-01-01 to 2025-04-01 is 50 USD");
  });

  it("rejects date range exceeding 90-day maximum", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-04-02", "50.00", [
          { key: "Amazon EC2", amount: "50.00" },
        ]),
      ]),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
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

  it("returns normalized error when AWS request fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_aws_cost_by_service");
    const result = await mock.capturedHandler!({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    }) as Record<string, unknown>;

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "aws_request_failed", retryable: false },
    });
  });

  describe("execution metadata", () => {
    it("reports cache hit with zero AWS requests and visible billing note", async () => {
      const cachedByService = {
        period: { startDate: "2025-01-01", endDate: "2025-02-01" },
        currency: "USD",
        total: 99,
        services: [{ service: "Amazon EC2", amount: 99 }],
      };

      const mockKv = {
        get: vi.fn(async () => cachedByService),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_by_service");
      const result = await mock.capturedHandler!({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown>; content: Array<{ type: string; text: string }> };

      const execution = result.structuredContent.execution as {
        cache: { status: string };
        awsRequestCount: number;
        billing: { charged: boolean; note: string };
      };

      expect(execution.cache.status).toBe("hit");
      expect(execution.awsRequestCount).toBe(0);
      expect(execution.billing.charged).toBe(false);
      expect(execution.billing.note).toContain("No new AWS Cost Explorer API request was made");
      expect(result.content[0].text).toContain(
        "Billing note: served from cache. No new AWS Cost Explorer API request was made.",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("reports cache miss with AWS request telemetry, billing charge, and visible note", async () => {
      mockFetch.mockResolvedValue(
        ceResponse([
          makeDayWithGroups("2025-01-01", "2025-02-01", "42.50", [
            { key: "Amazon EC2", amount: "42.50" },
          ]),
        ]),
      );

      const mockKv = {
        get: vi.fn(async () => null),
        put: vi.fn(),
      } as never;

      const ctxWithCache: GatewayContext = { ...testContext, cache: mockKv };
      const mock = makeMockServer();
      registerMcpToolForTest(mock.server, ctxWithCache, "get_aws_cost_by_service");
      const result = await mock.capturedHandler!({
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "MONTHLY",
      }) as { structuredContent: Record<string, unknown>; content: Array<{ type: string; text: string }> };

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
      expect(result.content[0].text).toContain(
        "Billing note: served from AWS Cost Explorer, not cache. Estimated AWS API cost: US$ 0.01.",
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
