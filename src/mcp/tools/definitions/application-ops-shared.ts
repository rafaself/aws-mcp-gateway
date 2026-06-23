import { z } from "zod";
import type { AwsCapabilityId } from "../manifest.js";

export const applicationProfileIdInputSchema = z.object({
  profileId: z
    .string()
    .describe("Application profile id from list_application_profiles."),
});

export type ApplicationProfileIdInput = z.infer<typeof applicationProfileIdInputSchema>;

export const APPLICATION_OPS_OVERVIEW_CAPABILITIES = [
  "ecs:DescribeClusters",
  "ecs:DescribeServices",
  "ecs:ListTasks",
  "ecs:DescribeTasks",
  "ecs:DescribeTaskDefinition",
  "rds:DescribeDBInstances",
  "rds:DescribeDBSubnetGroups",
  "logs:FilterLogEvents",
  "ssm:DescribeParameters",
  "ecr:DescribeImages",
  "ecr:DescribeImageScanFindings",
  "ecr:GetLifecyclePolicy",
  "s3:GetBucketLocation",
  "s3:GetBucketPublicAccessBlock",
  "s3:GetBucketEncryption",
  "s3:GetBucketVersioning",
  "s3:GetLifecycleConfiguration",
  "s3:GetBucketPolicyStatus",
  "cloudwatch:GetMetricData",
  "ses:GetConfigurationSet",
  "ses:GetConfigurationSetEventDestinations",
  "sns:ListTopics",
  "sns:GetTopicAttributes",
  "sns:ListSubscriptionsByTopic",
  "events:ListRules",
  "events:DescribeRule",
  "events:ListTargetsByRule",
  "cloudwatch:DescribeAlarms",
  "budgets:DescribeBudgets",
  "budgets:DescribeNotificationsForBudget",
  "budgets:DescribeSubscribersForNotification",
] as const satisfies readonly AwsCapabilityId[];

export const APPLICATION_OPS_OVERVIEW_SERVICES = [
  "ecs",
  "rds",
  "logs",
  "ssm",
  "ecr",
  "s3",
  "ses",
  "sns",
  "events",
  "cloudwatch",
  "budgets",
] as const;

export const APPLICATION_OPS_OVERVIEW_ACTIONS = [
  "ecs:DescribeClusters",
  "ecs:DescribeServices",
  "ecs:ListTasks",
  "ecs:DescribeTasks",
  "ecs:DescribeTaskDefinition",
  "rds:DescribeDBInstances",
  "rds:DescribeDBSubnetGroups",
  "logs:FilterLogEvents",
  "ssm:DescribeParameters",
  "ecr:DescribeImages",
  "ecr:DescribeImageScanFindings",
  "ecr:GetLifecyclePolicy",
  "s3:GetBucketLocation",
  "s3:GetBucketPublicAccessBlock",
  "s3:GetBucketEncryption",
  "s3:GetBucketVersioning",
  "s3:GetLifecycleConfiguration",
  "s3:GetBucketPolicyStatus",
  "cloudwatch:GetMetricData",
  "ses:GetConfigurationSet",
  "ses:GetConfigurationSetEventDestinations",
  "sns:ListTopics",
  "sns:GetTopicAttributes",
  "sns:ListSubscriptionsByTopic",
  "events:ListRules",
  "events:DescribeRule",
  "events:ListTargetsByRule",
  "cloudwatch:DescribeAlarms",
  "budgets:DescribeBudgets",
  "budgets:DescribeNotificationsForBudget",
  "budgets:DescribeSubscribersForNotification",
] as const;

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
