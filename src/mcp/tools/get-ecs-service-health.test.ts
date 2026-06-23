import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ecsJsonResponse,
  makeEcsCluster,
  makeEcsService,
} from "../../test/fixtures.js";

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

function targetFromRequest(init: RequestInit): string {
  const headers = init.headers as Record<string, string>;
  return headers["X-Amz-Target"] ?? headers["x-amz-target"] ?? "";
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_ecs_service_health tool", () => {
  it("returns structured service health on success", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      return Promise.resolve(
        ecsJsonResponse({ services: [makeEcsService({ runningCount: 2 })] }),
      );
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_ecs_service_health");
    const result = await mock.getTool("get_ecs_service_health")!.handler({
      clusterName: "my-cluster",
      serviceName: "my-service",
      region: "us-east-1",
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      clusterName: "my-cluster",
      serviceName: "my-service",
      runningCount: 2,
      taskDefinition: "my-app:42",
    });
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_ecs_service_health");
    const result = await mock.getTool("get_ecs_service_health")!.handler({
      clusterName: "my-cluster",
      serviceName: "my-service",
      region: "eu-west-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
