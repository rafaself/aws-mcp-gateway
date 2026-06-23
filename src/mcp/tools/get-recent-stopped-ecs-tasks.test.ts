import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ecsJsonResponse,
  makeEcsCluster,
  makeEcsTask,
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

describe("get_recent_stopped_ecs_tasks tool", () => {
  it("returns stopped task diagnostics on success", async () => {
    const task = makeEcsTask({
      lastStatus: "STOPPED",
      desiredStatus: "STOPPED",
      stoppedAt: new Date().toISOString(),
      stopCode: "EssentialContainerExited",
      stoppedReason: "Essential container exited",
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("ListTasks")) {
        return Promise.resolve(ecsJsonResponse({ taskArns: [task.taskArn] }));
      }
      return Promise.resolve(ecsJsonResponse({ tasks: [task] }));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_recent_stopped_ecs_tasks");
    const result = await mock.getTool("get_recent_stopped_ecs_tasks")!.handler({
      clusterName: "my-cluster",
      region: "us-east-1",
      lookbackMinutes: 60,
      limit: 10,
    }) as Record<string, unknown>;

    expect(result.structuredContent).toMatchObject({
      region: "us-east-1",
      clusterName: "my-cluster",
      count: 1,
    });
    const tasks = (result.structuredContent as { tasks: Array<{ stopCode?: string }> }).tasks;
    expect(tasks[0]).toMatchObject({ stopCode: "EssentialContainerExited" });
  });

  it("rejects disallowed region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, singleRegionContext, "get_recent_stopped_ecs_tasks");
    const result = await mock.getTool("get_recent_stopped_ecs_tasks")!.handler({
      clusterName: "my-cluster",
      region: "eu-west-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
