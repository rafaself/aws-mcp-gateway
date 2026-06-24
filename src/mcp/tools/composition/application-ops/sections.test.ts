import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../../../test/gateway-context-fixture.js";
import {
  buildAlertingStatus,
  buildComputeStatus,
  buildEnvironmentOverview,
} from "./sections.js";
import { buildApplicationOpsContext } from "./types.js";
import type { ValidatedAppProfile } from "../../../../profiles/types.js";

const { mockGetServiceHealth, mockGetConfigurationStatus, mockGetTopicStatus, mockResolveSectionCredentials } =
  vi.hoisted(() => ({
    mockGetServiceHealth: vi.fn(),
    mockGetConfigurationStatus: vi.fn(),
    mockGetTopicStatus: vi.fn(),
    mockResolveSectionCredentials: vi.fn(),
  }));

vi.mock("../../../../profiles/access.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../profiles/access.js")>();
  mockResolveSectionCredentials.mockImplementation(async (ctx, profile, block) => ({
    credentials: ctx.credentials,
    authStrategy: actual.authStrategyLabel(block?.auth, profile.auth),
  }));
  return {
    ...actual,
    resolveSectionCredentials: mockResolveSectionCredentials,
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
  getTopicStatus: mockGetTopicStatus,
}));
vi.mock("../../../../aws/eventbridge/index.js", () => ({
  getRulesStatus: vi.fn(),
}));
vi.mock("../../../../aws/cloudwatch/index.js", () => ({
  summarizeAlarms: vi.fn(async () => ({ alarmCount: 0, alarms: [] })),
}));
vi.mock("../../../../aws/budgets/index.js", () => ({
  getBudgetStatus: vi.fn(),
}));

const baseProfile: ValidatedAppProfile = {
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

beforeEach(async () => {
  mockGetServiceHealth.mockReset();
  mockGetConfigurationStatus.mockReset();
  mockGetTopicStatus.mockReset();
  mockResolveSectionCredentials.mockClear();
  const { authStrategyLabel } = await import("../../../../profiles/access.js");
  mockResolveSectionCredentials.mockImplementation(async (ctx, profile, block) => ({
    credentials: ctx.credentials,
    authStrategy: authStrategyLabel(block?.auth, profile.auth),
  }));
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
  mockGetTopicStatus.mockResolvedValue({
    region: "us-east-1",
    topicExists: true,
    topicName: "example-alerts",
    subscriptionCount: 1,
    subscriptions: [],
  });
});

describe("buildEnvironmentOverview", () => {
  it("composes configured profile sections and skips unconfigured blocks", async () => {
    const ctx = createTestGatewayContext();
    const ops = buildApplicationOpsContext(ctx, baseProfile);
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
    const ops = buildApplicationOpsContext(ctx, baseProfile);
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

describe("resource-level auth overrides", () => {
  it("uses profile-level auth when ecs block has no override", async () => {
    const ctx = createTestGatewayContext();
    const profile: ValidatedAppProfile = {
      ...baseProfile,
      auth: {
        strategy: "assume-role",
        roleArn: "arn:aws:iam::123456789012:role/ProfileRole",
      },
      resources: {
        ecs: {
          clusterName: "example-production",
          serviceName: "example-production-api",
        },
      },
    };
    const ops = buildApplicationOpsContext(ctx, profile);

    const result = await buildComputeStatus(ops);

    expect(result.status).toBe("ok");
    expect(result.authStrategy).toBe("assume-role");
    expect(mockResolveSectionCredentials).toHaveBeenCalledWith(ctx, profile, profile.resources.ecs);
  });

  it("passes sns block auth into credential resolution", async () => {
    const ctx = createTestGatewayContext();
    const profile: ValidatedAppProfile = {
      ...baseProfile,
      auth: { strategy: "default" },
      resources: {
        sns: {
          topicName: "example-alerts",
          auth: {
            strategy: "assume-role",
            roleArn: "arn:aws:iam::123456789012:role/SnsReadOnly",
          },
        },
      },
    };
    const ops = buildApplicationOpsContext(ctx, profile);

    const result = await buildAlertingStatus(ops);

    expect(result.status).toBe("ok");
    expect(result.authStrategy).toBe("assume-role");
    expect(mockResolveSectionCredentials).toHaveBeenCalledWith(ctx, profile, profile.resources.sns);
    expect(mockGetTopicStatus).toHaveBeenCalled();
  });

  it("falls back to default credentials when block and profile auth are absent", async () => {
    const ctx = createTestGatewayContext();
    const profile: ValidatedAppProfile = {
      ...baseProfile,
      resources: {
        ecs: {
          clusterName: "example-production",
          serviceName: "example-production-api",
        },
      },
    };
    const ops = buildApplicationOpsContext(ctx, profile);

    const result = await buildComputeStatus(ops);

    expect(result.status).toBe("ok");
    expect(result.authStrategy).toBe("default");
    expect(mockResolveSectionCredentials).toHaveBeenCalledWith(ctx, profile, profile.resources.ecs);
  });
});
