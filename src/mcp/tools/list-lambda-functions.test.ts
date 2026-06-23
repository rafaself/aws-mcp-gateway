import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  lambdaListFunctionsResponse,
  makeLambdaFunction,
} from "../../test/fixtures.js";

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

describe("registerListLambdaFunctionsTool", () => {
  it("registers list_lambda_functions tool", () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "list_lambda_functions");
    expect(mock.getTool("list_lambda_functions")?.name).toBe("list_lambda_functions");
  });

  it("returns content and structuredContent on success", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        lambdaListFunctionsResponse([makeLambdaFunction({ functionName: "my-fn" })]),
      ),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_lambda_functions");
    const result = await mock.getTool("list_lambda_functions")!.handler({}) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      regions: ["us-east-1"],
      count: 1,
      functions: [
        { functionName: "my-fn", region: "us-east-1", runtime: "python3.12", state: "Active" },
      ],
    });
  });

  it("rejects disallowed regions before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_lambda_functions");
    const result = await mock.getTool("list_lambda_functions")!.handler({
      regions: ["eu-west-1"],
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not leak raw AWS fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(lambdaListFunctionsResponse([makeLambdaFunction()])),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "list_lambda_functions");
    const result = await mock.getTool("list_lambda_functions")!.handler({}) as {
      structuredContent: { functions: Array<Record<string, unknown>> };
    };

    expect(Object.keys(result.structuredContent.functions[0])).toEqual([
      "functionName", "region", "runtime", "state",
    ]);
  });
});
