import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import { ecrErrorResponse, ecrJsonResponse, makeEcrImageDetail } from "../../test/fixtures.js";

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

describe("get_ecr_image_status tool", () => {
  it("returns normalized structured output", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeImages")) {
        return Promise.resolve(
          ecrJsonResponse({ imageDetails: [makeEcrImageDetail()] }),
        );
      }
      if (target.endsWith("GetLifecyclePolicy")) {
        return Promise.resolve(ecrJsonResponse({ lifecyclePolicyText: "{}" }));
      }
      return Promise.resolve(ecrJsonResponse({}));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_ecr_image_status");
    const result = await mock.getTool("get_ecr_image_status")!.handler({
      repositoryName: "my-app",
    }) as { structuredContent: Record<string, unknown> };

    expect(result.structuredContent).toMatchObject({
      found: true,
      repositoryName: "my-app",
    });
  });

  it("rejects invalid region before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_ecr_image_status");
    const result = await mock.getTool("get_ecr_image_status")!.handler({
      repositoryName: "my-app",
      region: "ap-south-1",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns found false for missing repository", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(ecrErrorResponse("RepositoryNotFoundException")),
    );

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_ecr_image_status");
    const result = await mock.getTool("get_ecr_image_status")!.handler({
      repositoryName: "missing",
    }) as { structuredContent: { found: boolean } };

    expect(result.structuredContent.found).toBe(false);
  });
});
