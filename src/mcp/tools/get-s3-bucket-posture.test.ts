import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";
import {
  ecrJsonResponse,
  ecsJsonResponse,
  makeEcrImageDetail,
  makeEcsCluster,
  makeEcsService,
  makeEcsTaskWithImage,
  s3ErrorXml,
} from "../../test/fixtures.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const testContext = createTestGatewayContext({
  toolExposure: {
    ...createTestGatewayContext().toolExposure,
    enabledToolPacks: new Set([
      "core",
      "cost",
      "inventory",
      "observability",
      "database",
      "security",
    ]),
  },
});

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

beforeEach(() => {
  mockFetch.mockReset();
});

describe("get_s3_bucket_posture tool", () => {
  it("returns bucketExists false without object reads", async () => {
    mockFetch.mockImplementation(() => Promise.resolve(s3ErrorXml("NoSuchBucket")));

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_s3_bucket_posture");
    const result = await mock.getTool("get_s3_bucket_posture")!.handler({
      bucketName: "missing-bucket",
    }) as { structuredContent: Record<string, unknown> };

    expect(result.structuredContent).toMatchObject({
      bucketExists: false,
      tlsOnlyPolicyIndicator: "unknown",
    });
    expect(JSON.stringify(result.structuredContent)).not.toMatch(/Contents/);
  });

  it("rejects invalid bucket names before AWS call", async () => {
    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "get_s3_bucket_posture");
    const result = await mock.getTool("get_s3_bucket_posture")!.handler({
      bucketName: "INVALID",
    }) as { isError?: boolean };

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("compare_ecs_task_image_with_ecr tool", () => {
  it("registers and returns comparison output", async () => {
    const digest = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const task = makeEcsTaskWithImage({
      image: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest",
      imageDigest: digest,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = (init.headers as Record<string, string>)["X-Amz-Target"] ?? "";
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("DescribeServices")) {
        return Promise.resolve(ecsJsonResponse({ services: [makeEcsService()] }));
      }
      if (target.endsWith("DescribeTaskDefinition")) {
        return Promise.resolve(
          ecsJsonResponse({
            taskDefinition: {
              family: "my-app",
              revision: 42,
              containerDefinitions: [
                {
                  name: "app",
                  image: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest",
                },
              ],
            },
          }),
        );
      }
      if (target.endsWith("ListTasks")) {
        return Promise.resolve(ecsJsonResponse({ taskArns: [task.taskArn] }));
      }
      if (target.endsWith("DescribeTasks")) {
        return Promise.resolve(ecsJsonResponse({ tasks: [task] }));
      }
      if (target.endsWith("DescribeImages")) {
        return Promise.resolve(
          ecrJsonResponse({ imageDetails: [makeEcrImageDetail({ digest })] }),
        );
      }
      if (target.endsWith("DescribeImageScanFindings")) {
        return Promise.resolve(
          ecrJsonResponse({
            imageScanFindings: { findingSeverityCounts: { CRITICAL: 0, HIGH: 0 } },
          }),
        );
      }
      if (target.endsWith("GetLifecyclePolicy")) {
        return Promise.resolve(ecrJsonResponse({}));
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const mock = makeMockServer();
    registerMcpToolForTest(mock.server, testContext, "compare_ecs_task_image_with_ecr");
    const result = await mock.getTool("compare_ecs_task_image_with_ecr")!.handler({
      clusterName: "my-cluster",
      serviceName: "my-service",
      repositoryName: "my-app",
    }) as { structuredContent: Record<string, unknown> };

    expect(result.structuredContent).toMatchObject({
      matchesEcrDigest: true,
      ecrImageFound: true,
    });
  });
});
