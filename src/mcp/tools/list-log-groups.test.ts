import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  logsDescribeLogGroupsResponse,
  makeLogGroup,
} from "../../test/fixtures.js";
import { LOG_GROUP_PREFIX_MAX_LENGTH } from "../../security/limits.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const testContext = createTestGatewayContext();
const singleRegionContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

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

describe("registerListLogGroupsTool", () => {
  it("registers list_log_groups tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_log_groups");
    expect(mock.getTool("list_log_groups")?.name).toBe("list_log_groups");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        logsDescribeLogGroupsResponse([
          makeLogGroup({ logGroupName: "/aws/lambda/app" }),
        ]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_log_groups");
    const result = await mock.getTool("list_log_groups")!.handler({
      region: "us-east-1",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      region: "us-east-1",
      count: 1,
      logGroups: [{ name: "/aws/lambda/app" }],
    });
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_log_groups");
    const result = await mock.getTool("list_log_groups")!.handler({
      region: "eu-west-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects prefix exceeding max length before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_log_groups");
    const result = await mock.getTool("list_log_groups")!.handler({
      region: "us-east-1",
      prefix: "x".repeat(LOG_GROUP_PREFIX_MAX_LENGTH + 1),
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw AWS fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(logsDescribeLogGroupsResponse([makeLogGroup()])),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_log_groups");
    const result = await mock.getTool("list_log_groups")!.handler({
      region: "us-east-1",
    }) as { structuredContent: { logGroups: Array<Record<string, unknown>> } };

    expect(Object.keys(result.structuredContent.logGroups[0])).toEqual(["name"]);
  });
});
