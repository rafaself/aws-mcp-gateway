import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const singleRegionContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

interface CapturedTool {
  name: string;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer() {
  const tools: CapturedTool[] = [];
  const server = {
    registerTool: (n: string, _c: unknown, h: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools.push({ name: n, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;
  return { server, getTool: (name: string) => tools.find((t) => t.name === name) };
}

function rdsXmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

function describeDbInstancesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DescribeDBInstancesResponse xmlns="http://rds.amazonaws.com/doc/2014-10-31/">
  <DescribeDBInstancesResult>
    <DBInstances>
      <DBInstance>
        <DBInstanceIdentifier>my-db</DBInstanceIdentifier>
        <DBInstanceStatus>available</DBInstanceStatus>
      </DBInstance>
    </DBInstances>
  </DescribeDBInstancesResult>
</DescribeDBInstancesResponse>`;
}

function metricDataJsonResponse(): Response {
  return new Response(
    JSON.stringify({
      MetricDataResults: [
        {
          Id: "CPUUtilization",
          Timestamps: [1_718_000_000_000],
          Values: [10],
        },
      ],
    }),
    {
      status: 200,
      headers: { "content-type": "application/x-amz-json-1.1" },
    },
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_rds_metrics tool", () => {
  it("returns structured metrics on success", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = init.body?.toString() ?? "";
      if (body.includes("Action=DescribeDBInstances")) {
        return Promise.resolve(rdsXmlResponse(describeDbInstancesXml()));
      }
      return Promise.resolve(metricDataJsonResponse());
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_metrics");
    const result = await mock.getTool("get_rds_metrics")!.handler({
      dbInstanceIdentifier: "my-db",
      region: "us-east-1",
      lookbackMinutes: 60,
      periodSeconds: 300,
    }) as Record<string, unknown>;

    const structured = result.structuredContent as {
      metrics: Array<{ name: string; status: string }>;
    };
    expect(structured.metrics).toHaveLength(8);
    expect(structured.metrics.find((m) => m.name === "CPUUtilization")).toMatchObject({
      status: "ok",
    });
    expect(structured.metrics.find((m) => m.name === "ReadIOPS")).toMatchObject({
      status: "no_data",
    });
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_metrics");
    const result = await mock.getTool("get_rds_metrics")!.handler({
      dbInstanceIdentifier: "my-db",
      region: "eu-west-1",
    }) as { isError?: boolean; structuredContent?: { error?: { code?: string } } };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects out-of-range lookbackMinutes", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_rds_metrics");
    const result = await mock.getTool("get_rds_metrics")!.handler({
      dbInstanceIdentifier: "my-db",
      region: "us-east-1",
      lookbackMinutes: 5000,
    }) as { isError?: boolean; structuredContent?: { error?: { code?: string } } };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: { code: "validation_error", retryable: false },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
