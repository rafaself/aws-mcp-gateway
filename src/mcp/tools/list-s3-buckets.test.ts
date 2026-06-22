import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { s3ListBucketsXml } from "../../test/fixtures.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const testContext = createTestGatewayContext();

interface CapturedTool {
  name: string;
  config: unknown;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeMockServer() {
  const tools: CapturedTool[] = [];
  const server = {
    registerTool: (n: string, c: unknown, h: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools.push({ name: n, config: c, handler: h });
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;
  return { server, getTool: (name: string) => tools.find((t) => t.name === name) };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("registerListS3BucketsTool", () => {
  it("registers list_s3_buckets tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_s3_buckets");
    expect(mock.getTool("list_s3_buckets")?.name).toBe("list_s3_buckets");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_s3_buckets");
    const result = await mock.getTool("list_s3_buckets")!.handler({}) as Record<string, unknown>;

    expect(result.structuredContent).toEqual({
      count: 1,
      buckets: [{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }],
    });
  });

  it("rejects limit above max before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_s3_buckets");
    const result = await mock.getTool("list_s3_buckets")!.handler({ limit: 101 }) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak owner or policy fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_s3_buckets");
    const result = await mock.getTool("list_s3_buckets")!.handler({}) as {
      structuredContent: { buckets: Array<Record<string, unknown>> };
    };

    expect(Object.keys(result.structuredContent.buckets[0])).toEqual(["name", "createdAt"]);
  });
});
