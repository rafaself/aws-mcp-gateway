import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ecrJsonResponse,
  ecsJsonResponse,
  makeEcrImageDetail,
  makeEcsCluster,
  makeEcsService,
  makeEcsTaskWithImage,
} from "../../test/fixtures.js";
import { compareServiceImageWithEcr } from "./image-compare.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials = {
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
};

const region = "us-east-1";
const digest = "sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

function targetFromRequest(init: RequestInit): string {
  const headers = init.headers as Record<string, string>;
  return headers["X-Amz-Target"] ?? headers["x-amz-target"] ?? "";
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("compareServiceImageWithEcr", () => {
  it("compares ECS running digests against ECR", async () => {
    const task = makeEcsTaskWithImage({
      image: `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest`,
      imageDigest: digest,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("DescribeServices")) {
        return Promise.resolve(
          ecsJsonResponse({
            services: [
              makeEcsService({
                taskDefinition:
                  "arn:aws:ecs:us-east-1:123456789012:task-definition/my-app:42",
              }),
            ],
          }),
        );
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
                  image: `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest`,
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
          ecrJsonResponse({
            imageDetails: [makeEcrImageDetail({ digest, tags: ["latest"] })],
          }),
        );
      }
      if (target.endsWith("DescribeImageScanFindings")) {
        return Promise.resolve(
          ecrJsonResponse({
            imageScanFindings: { findingSeverityCounts: { CRITICAL: 0, HIGH: 1 } },
          }),
        );
      }
      if (target.endsWith("GetLifecyclePolicy")) {
        return Promise.resolve(ecrJsonResponse({}));
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const comparison = await compareServiceImageWithEcr(
      "my-cluster",
      "my-service",
      "my-app",
      { region, expectedImageDigest: digest },
      credentials,
    );

    expect(comparison).toMatchObject({
      taskDefinitionImage: `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest`,
      runningTaskImageDigests: [digest],
      ecrImageDigest: digest,
      ecrImageFound: true,
      matchesEcrDigest: true,
      matchesExpectedDigest: true,
    });
  });
});
