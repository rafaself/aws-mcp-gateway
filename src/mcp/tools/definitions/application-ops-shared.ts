import { z } from "zod";
import {
  awsActionsForCapabilities,
  awsServicesForCapabilities,
  type AwsCapabilityId,
} from "../../../aws/capabilities.js";

export const applicationProfileIdInputSchema = z.object({
  profileId: z
    .string()
    .describe("Application profile id from list_application_profiles."),
});

export type ApplicationProfileIdInput = z.infer<typeof applicationProfileIdInputSchema>;

export type ApplicationOpsSectionId =
  | "compute"
  | "database"
  | "logs"
  | "ssm"
  | "artifacts"
  | "s3"
  | "ses"
  | "alerting"
  | "budget";

export const APPLICATION_OPS_PROFILE_AUTH_CAPABILITIES = [
  "sts:AssumeRole",
] as const satisfies readonly AwsCapabilityId[];

export const APPLICATION_OPS_SECTION_BASE_CAPABILITIES = {
  compute: [
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:ListTasks",
    "ecs:DescribeTasks",
  ],
  database: ["rds:DescribeDBInstances", "rds:DescribeDBSubnetGroups"],
  logs: ["logs:FilterLogEvents"],
  ssm: ["ssm:DescribeParameters"],
  artifacts: [
    "ecs:DescribeClusters",
    "ecs:DescribeServices",
    "ecs:DescribeTaskDefinition",
    "ecs:ListTasks",
    "ecs:DescribeTasks",
    "ecr:DescribeImages",
    "ecr:DescribeImageScanFindings",
    "ecr:GetLifecyclePolicy",
  ],
  s3: [
    "s3:GetBucketLocation",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketEncryption",
    "s3:GetBucketVersioning",
    "s3:GetLifecycleConfiguration",
    "s3:GetBucketPolicyStatus",
  ],
  ses: ["ses:GetConfigurationSet", "ses:GetConfigurationSetEventDestinations"],
  alerting: [
    "sns:ListTopics",
    "sns:GetTopicAttributes",
    "sns:ListSubscriptionsByTopic",
    "events:ListRules",
    "events:DescribeRule",
    "events:ListTargetsByRule",
    "scheduler:ListSchedules",
    "scheduler:GetSchedule",
    "cloudwatch:DescribeAlarms",
  ],
  budget: [
    "budgets:DescribeBudgets",
    "budgets:DescribeNotificationsForBudget",
    "budgets:DescribeSubscribersForNotification",
  ],
} as const satisfies Record<ApplicationOpsSectionId, readonly AwsCapabilityId[]>;

export function unionApplicationOpsCapabilities(
  ...sets: ReadonlyArray<readonly AwsCapabilityId[]>
): AwsCapabilityId[] {
  return [...new Set(sets.flat())].sort();
}

export function withProfileAuthCapabilities(
  base: readonly AwsCapabilityId[],
): AwsCapabilityId[] {
  return unionApplicationOpsCapabilities(base, APPLICATION_OPS_PROFILE_AUTH_CAPABILITIES);
}

export function applicationOpsCapabilitiesForSections(
  sections: readonly ApplicationOpsSectionId[],
): AwsCapabilityId[] {
  const bases = sections.map((section) => APPLICATION_OPS_SECTION_BASE_CAPABILITIES[section]);
  return withProfileAuthCapabilities(unionApplicationOpsCapabilities(...bases));
}

export const APPLICATION_OPS_TOOL_SECTIONS = {
  get_application_environment_overview: [
    "compute",
    "database",
    "logs",
    "ssm",
    "artifacts",
    "s3",
    "ses",
    "alerting",
    "budget",
  ],
  get_application_compute_status: ["compute"],
  get_application_database_status: ["database"],
  get_application_logs: ["logs"],
  get_application_secret_inventory: ["ssm"],
  get_application_artifact_status: ["artifacts"],
  get_application_alerting_status: ["alerting"],
  get_application_cost_status: ["budget"],
} as const satisfies Record<string, readonly ApplicationOpsSectionId[]>;

function deriveApplicationOpsAwsMetadata(capabilities: readonly AwsCapabilityId[]) {
  return {
    services: awsServicesForCapabilities(capabilities),
    actions: awsActionsForCapabilities(capabilities),
    capabilities: [...capabilities] as AwsCapabilityId[],
  };
}

const computeCapabilities = withProfileAuthCapabilities(
  APPLICATION_OPS_SECTION_BASE_CAPABILITIES.compute,
);
const databaseCapabilities = withProfileAuthCapabilities(
  APPLICATION_OPS_SECTION_BASE_CAPABILITIES.database,
);
const logsCapabilities = withProfileAuthCapabilities(APPLICATION_OPS_SECTION_BASE_CAPABILITIES.logs);
const ssmCapabilities = withProfileAuthCapabilities(APPLICATION_OPS_SECTION_BASE_CAPABILITIES.ssm);
const artifactsCapabilities = withProfileAuthCapabilities(
  APPLICATION_OPS_SECTION_BASE_CAPABILITIES.artifacts,
);
const alertingCapabilities = withProfileAuthCapabilities(
  APPLICATION_OPS_SECTION_BASE_CAPABILITIES.alerting,
);
const budgetCapabilities = withProfileAuthCapabilities(
  APPLICATION_OPS_SECTION_BASE_CAPABILITIES.budget,
);
const overviewCapabilities = applicationOpsCapabilitiesForSections(
  APPLICATION_OPS_TOOL_SECTIONS.get_application_environment_overview,
);

export const APPLICATION_OPS_COMPUTE_AWS = deriveApplicationOpsAwsMetadata(computeCapabilities);
export const APPLICATION_OPS_DATABASE_AWS = deriveApplicationOpsAwsMetadata(databaseCapabilities);
export const APPLICATION_OPS_LOGS_AWS = deriveApplicationOpsAwsMetadata(logsCapabilities);
export const APPLICATION_OPS_SSM_AWS = deriveApplicationOpsAwsMetadata(ssmCapabilities);
export const APPLICATION_OPS_ARTIFACTS_AWS = deriveApplicationOpsAwsMetadata(artifactsCapabilities);
export const APPLICATION_OPS_ALERTING_AWS = deriveApplicationOpsAwsMetadata(alertingCapabilities);
export const APPLICATION_OPS_BUDGET_AWS = deriveApplicationOpsAwsMetadata(budgetCapabilities);
export const APPLICATION_OPS_OVERVIEW_AWS = deriveApplicationOpsAwsMetadata(overviewCapabilities);

export const APPLICATION_OPS_SAFETY = {
  riskLevel: "read-only" as const,
  cacheTtlSeconds: 300,
  timeoutMs: 30000,
  costClass: "cached-read" as const,
};

export const APPLICATION_OPS_COST_CONTROL = {
  class: "fanout-sensitive" as const,
  requiresCache: true,
  timeoutMs: 30000,
  minCacheTtlSeconds: 300,
};
