import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { ceResponse, makeDayTotal, makeDayWithGroups } from "../../test/fixtures.js";
import type { ToolPack } from "./manifest.js";
import { COST_MAX_SERVICE_ROWS } from "../../security/limits.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const testContext = createTestGatewayContext({
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

beforeEach(() => {
  mockFetch.mockReset();
});

describe("aws_cost_overview", () => {
  it("registers aws_cost_overview tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "aws_cost_overview");
    expect(mock.getTool("aws_cost_overview")).toBeDefined();
  });

  it("composes cost summary and by-service overview", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ceResponse([
          makeDayWithGroups("2025-01-01", "2025-02-01", "100.00", [
            { key: "Amazon EC2", amount: "60.00" },
            { key: "Amazon S3", amount: "40.00" },
          ]),
        ]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "aws_cost_overview");
    const result = (await mock.getTool("aws_cost_overview")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      serviceLimit: 2,
    })) as Record<string, unknown>;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const structured = result.structuredContent as {
      total: number;
      services: Array<{ service: string; amount: number }>;
    };
    expect(structured.total).toBe(100);
    expect(structured.services).toHaveLength(2);
  });

  it("rejects serviceLimit above policy max before AWS calls", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "aws_cost_overview");
    const result = (await mock.getTool("aws_cost_overview")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      serviceLimit: COST_MAX_SERVICE_ROWS + 1,
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects invalid dates before AWS calls", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "aws_cost_overview");
    const result = (await mock.getTool("aws_cost_overview")!.handler({
      startDate: "invalid",
      endDate: "2025-02-01",
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies calls when aggregates pack is disabled", async () => {
    const defaultContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, defaultContext, "aws_cost_overview");
    const result = (await mock.getTool("aws_cost_overview")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw Cost Explorer response fields", async () => {
    mockFetch.mockResolvedValue(ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "aws_cost_overview");
    const result = (await mock.getTool("aws_cost_overview")!.handler({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    })) as Record<string, unknown>;

    const resultStr = JSON.stringify(result);
    expect(resultStr).not.toContain("ResultsByTime");
    expect(resultStr).not.toContain("ResponseMetadata");
  });
});
