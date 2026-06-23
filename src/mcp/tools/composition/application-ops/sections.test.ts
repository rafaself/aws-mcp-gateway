import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../../../test/gateway-context-fixture.js";
import { buildEnvironmentOverview } from "./sections.js";
import { buildApplicationOpsContext } from "./types.js";
import type { ValidatedAppProfile } from "../../../../profiles/types.js";

const { mockGetServiceHealth, mockGetConfigurationStatus } = vi.hoisted(() => ({
  mockGetServiceHealth: vi.fn(),
  mockGetConfigurationStatus: vi.fn(),
}));

vi.mock("../../../../profiles/access.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../profiles/access.js")>();
  return {
    ...actual,
    resolveBlockCredentials: vi.fn(async (ctx) => ctx.credentials),
  };
});

vi.mock("../../../../aws/ecs/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../aws/ecs/index.js")>();
  return {
    ...actual,
    getServiceHealth: mockGetServiceHealth,
    listEcsTasks: vi.fn(async () => []),
    compareServiceImageWithEcr: vi.fn(),
  };
});

vi.mock("../../../../aws/ses/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../aws/ses/index.js")>();
  return {
    ...actual,
    getConfigurationStatus: mockGetConfigurationStatus,
  };
});

vi.mock("../../../../aws/rds/index.js", () => ({
  getInstanceHealth: vi.fn(),
}));
vi.mock("../../../../aws/logs/index.js", () => ({
  filterLogEvents: vi.fn(),
}));
vi.mock("../../../../aws/ssm/index.js", () => ({
  checkParameterInventory: vi.fn(),
}));
vi.mock("../../../../aws/ecr/index.js", () => ({
  getImageStatus: vi.fn(),
}));
vi.mock("../../../../aws/s3/posture.js", () => ({
  getBucketPosture: vi.fn(),
}));
vi.mock("../../../../aws/sns/index.js", () => ({
  getTopicStatus: vi.fn(),
}));
vi.mock("../../../../aws/eventbridge/index.js", () => ({
  getRulesStatus: vi.fn(),
}));
vi.mock("../../../../aws/cloudwatch/index.js", () => ({
  summarizeAlarms: vi.fn(),
}));
vi.mock("../../../../aws/budgets/index.js", () => ({
  getBudgetStatus: vi.fn(),
}));

const profile: ValidatedAppProfile = {
  version: 1,
  id: "example-prod",
  displayName: "Example Production",
  environment: "production",
  region: "us-east-1",
  resources: {
    ecs: {
      clusterName: "example-production",
      serviceName: "example-production-api",
    },
    ses: {
      configurationSetName: "example-production",
      auth: {
        strategy: "assume-role",
        roleArn: "arn:aws:iam::123456789012:role/SesReadOnly",
      },
    },
  },
};

beforeEach(() => {
  mockGetServiceHealth.mockReset();
  mockGetConfigurationStatus.mockReset();
  mockGetServiceHealth.mockResolvedValue({
    clusterName: "example-production",
    serviceName: "example-production-api",
    region: "us-east-1",
    status: "ACTIVE",
    runningCount: 2,
    desiredCount: 2,
    pendingCount: 0,
  });
  mockGetConfigurationStatus.mockResolvedValue({
    region: "us-east-1",
    configurationSetName: "example-production",
    configurationSetExists: true,
    eventDestinations: [],
  });
});

describe("buildEnvironmentOverview", () => {
  it("composes configured profile sections and skips unconfigured blocks", async () => {
    const ctx = createTestGatewayContext();
    const ops = buildApplicationOpsContext(ctx, profile);
    const result = await buildEnvironmentOverview(ops);

    expect(result.profile.id).toBe("example-prod");
    expect(result.compute.status).toBe("ok");
    expect(result.database.status).toBe("skipped");
    expect(result.ses.status).toBe("ok");
    expect(result.ses.authStrategy).toBe("assume-role");
    expect(mockGetServiceHealth).toHaveBeenCalled();
    expect(mockGetConfigurationStatus).toHaveBeenCalled();
  });

  it("preserves redaction guarantees from SES primitive output", async () => {
    mockGetConfigurationStatus.mockResolvedValue({
      region: "us-east-1",
      configurationSetName: "example-production",
      configurationSetExists: true,
      eventDestinations: [
        {
          name: "alerts",
          enabled: true,
          matchingEventTypes: ["bounce"],
          destinationType: "SNS",
          snsTopicArn: "arn:aws:sns:us-east-1:123456789012:****",
        },
      ],
    });

    const ctx = createTestGatewayContext();
    const ops = buildApplicationOpsContext(ctx, profile);
    const result = await buildEnvironmentOverview(ops);

    expect(result.ses.data).toMatchObject({
      eventDestinations: [
        expect.objectContaining({
          snsTopicArn: "arn:aws:sns:us-east-1:123456789012:****",
        }),
      ],
    });
  });
});
