import { describe, expect, it } from "vitest";
import {
  AWS_CAPABILITY_IDS,
  AWS_CAPABILITY_REGISTRY,
  awsActionsForCapabilities,
  awsServicesForCapabilities,
  getAwsCapability,
  isAwsCapabilityId,
  isReadOnlyIamAction,
} from "./capabilities.js";

describe("aws capabilities registry", () => {
  it("defines the current capability IDs", () => {
    expect(AWS_CAPABILITY_IDS.sort()).toEqual([
      "budgets:DescribeBudgets",
      "budgets:DescribeNotificationsForBudget",
      "budgets:DescribeSubscribersForNotification",
      "ce:GetCostAndUsage",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetMetricData",
      "ec2:DescribeInstances",
      "ecr:DescribeImageScanFindings",
      "ecr:DescribeImages",
      "ecr:GetLifecyclePolicy",
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "events:DescribeRule",
      "events:ListRules",
      "events:ListTargetsByRule",
      "lambda:ListFunctions",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:FilterLogEvents",
      "rds:DescribeDBInstances",
      "rds:DescribeDBSubnetGroups",
      "s3:GetBucketEncryption",
      "s3:GetBucketLocation",
      "s3:GetBucketPolicyStatus",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketVersioning",
      "s3:GetLifecycleConfiguration",
      "s3:ListAllMyBuckets",
      "scheduler:GetSchedule",
      "scheduler:ListSchedules",
      "ses:GetConfigurationSet",
      "ses:GetConfigurationSetEventDestinations",
      "sns:GetTopicAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTopics",
      "ssm:DescribeParameters",
      "sts:AssumeRole",
    ]);
  });

  it("maps every capability to a read-only IAM action", () => {
    for (const id of AWS_CAPABILITY_IDS) {
      const capability = getAwsCapability(id);
      expect(capability.readonly).toBe(true);
      expect(isReadOnlyIamAction(capability.iamAction)).toBe(true);
    }
  });

  it("derives unique IAM actions and services", () => {
    expect(awsActionsForCapabilities(AWS_CAPABILITY_IDS)).toEqual([
      "budgets:DescribeBudgets",
      "budgets:DescribeNotificationsForBudget",
      "budgets:DescribeSubscribersForNotification",
      "ce:GetCostAndUsage",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetMetricData",
      "ec2:DescribeInstances",
      "ecr:DescribeImageScanFindings",
      "ecr:DescribeImages",
      "ecr:GetLifecyclePolicy",
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "events:DescribeRule",
      "events:ListRules",
      "events:ListTargetsByRule",
      "lambda:ListFunctions",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
      "logs:FilterLogEvents",
      "rds:DescribeDBInstances",
      "rds:DescribeDBSubnetGroups",
      "s3:GetBucketEncryption",
      "s3:GetBucketLocation",
      "s3:GetBucketPolicyStatus",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketVersioning",
      "s3:GetLifecycleConfiguration",
      "s3:ListAllMyBuckets",
      "scheduler:GetSchedule",
      "scheduler:ListSchedules",
      "ses:GetConfigurationSet",
      "ses:GetConfigurationSetEventDestinations",
      "sns:GetTopicAttributes",
      "sns:ListSubscriptionsByTopic",
      "sns:ListTopics",
      "ssm:DescribeParameters",
      "sts:AssumeRole",
    ]);
    expect(awsServicesForCapabilities(AWS_CAPABILITY_IDS)).toEqual([
      "budgets",
      "ce",
      "cloudwatch",
      "ec2",
      "ecr",
      "ecs",
      "events",
      "lambda",
      "logs",
      "rds",
      "s3",
      "scheduler",
      "ses",
      "sns",
      "ssm",
      "sts",
    ]);
  });

  it("rejects unknown capability IDs", () => {
    expect(isAwsCapabilityId("s3:GetObject")).toBe(false);
  });

  it("does not contain deployment-specific values", () => {
    const serialized = JSON.stringify(AWS_CAPABILITY_REGISTRY);
    expect(serialized).not.toMatch(/AKIA/);
    expect(serialized).not.toMatch(/arn:aws/);
    expect(serialized).not.toMatch(/\d{12}/);
  });
});
