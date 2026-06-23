import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ecsJsonResponse,
  makeEcsCluster,
  makeEcsService,
  makeEcsTask,
} from "../../test/fixtures.js";
import {
  getRecentStoppedEcsTasks,
  getServiceHealth,
  listEcsTasks,
} from "./client.js";
import { EcsError } from "./types.js";

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

function targetFromRequest(init: RequestInit): string {
  const headers = init.headers as Record<string, string>;
  return headers["X-Amz-Target"] ?? headers["x-amz-target"] ?? "";
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getServiceHealth", () => {
  it("returns normalized service health", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("DescribeServices")) {
        return Promise.resolve(
          ecsJsonResponse({ services: [makeEcsService({ runningCount: 2 })] }),
        );
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const health = await getServiceHealth("my-cluster", "my-service", region, credentials);

    expect(health).toMatchObject({
      clusterName: "my-cluster",
      serviceName: "my-service",
      region: "us-east-1",
      desiredCount: 2,
      runningCount: 2,
      taskDefinition: "my-app:42",
      launchType: "FARGATE",
      capacityProviders: ["FARGATE"],
    });
    expect(health.events).toHaveLength(1);
    expect(JSON.stringify(health)).not.toMatch(/arn:aws/);
  });

  it("throws not_found when cluster is missing", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        ecsJsonResponse({
          failures: [{ arn: "my-cluster", reason: "MISSING" }],
        }),
      ),
    );

    await expect(
      getServiceHealth("missing-cluster", "my-service", region, credentials),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws not_found when service is missing", async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      return Promise.resolve(
        ecsJsonResponse({
          failures: [{ arn: "my-service", reason: "MISSING" }],
        }),
      );
    });

    await expect(
      getServiceHealth("my-cluster", "missing-service", region, credentials),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("listEcsTasks", () => {
  it("lists and normalizes tasks", async () => {
    const task = makeEcsTask();
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("ListTasks")) {
        return Promise.resolve(ecsJsonResponse({ taskArns: [task.taskArn] }));
      }
      if (target.endsWith("DescribeTasks")) {
        return Promise.resolve(ecsJsonResponse({ tasks: [task] }));
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const tasks = await listEcsTasks(
      "my-cluster",
      { desiredStatus: "RUNNING", limit: 10 },
      region,
      credentials,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      taskId: "abc123def456",
      taskDefinition: "my-app:42",
      lastStatus: "RUNNING",
    });
  });

  it("rejects invalid desiredStatus", async () => {
    await expect(
      listEcsTasks(
        "my-cluster",
        { desiredStatus: "INVALID" as "RUNNING" },
        region,
        credentials,
      ),
    ).rejects.toBeInstanceOf(EcsError);
  });

  it("rejects limit above maximum", async () => {
    await expect(
      listEcsTasks("my-cluster", { limit: 101 }, region, credentials),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("getRecentStoppedEcsTasks", () => {
  it("filters tasks outside lookback window", async () => {
    const recentTask = makeEcsTask({
      lastStatus: "STOPPED",
      desiredStatus: "STOPPED",
      stoppedAt: new Date().toISOString(),
      stopCode: "EssentialContainerExited",
      stoppedReason: "Essential container exited",
    });
    const oldTask = makeEcsTask({
      taskArn: "arn:aws:ecs:us-east-1:123456789012:task/my-cluster/oldtask1",
      lastStatus: "STOPPED",
      desiredStatus: "STOPPED",
      stoppedAt: "2020-01-01T00:00:00.000Z",
      stopCode: "UserInitiated",
      stoppedReason: "Stopped by user",
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const target = targetFromRequest(init);
      if (target.endsWith("DescribeClusters")) {
        return Promise.resolve(ecsJsonResponse({ clusters: [makeEcsCluster()] }));
      }
      if (target.endsWith("ListTasks")) {
        return Promise.resolve(
          ecsJsonResponse({ taskArns: [recentTask.taskArn, oldTask.taskArn] }),
        );
      }
      if (target.endsWith("DescribeTasks")) {
        return Promise.resolve(ecsJsonResponse({ tasks: [recentTask, oldTask] }));
      }
      return Promise.reject(new Error(`unexpected target: ${target}`));
    });

    const stopped = await getRecentStoppedEcsTasks(
      "my-cluster",
      { lookbackMinutes: 60, limit: 10 },
      region,
      credentials,
    );

    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({
      taskId: "abc123def456",
      stopCode: "EssentialContainerExited",
    });
  });
});
