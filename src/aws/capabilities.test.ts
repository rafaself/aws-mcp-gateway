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
      "ce:GetCostAndUsage",
      "cloudwatch:DescribeAlarms",
      "ec2:DescribeInstances",
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "lambda:ListFunctions",
      "logs:DescribeLogGroups",
      "logs:FilterLogEvents",
      "s3:ListAllMyBuckets",
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
      "ce:GetCostAndUsage",
      "cloudwatch:DescribeAlarms",
      "ec2:DescribeInstances",
      "ecs:DescribeClusters",
      "ecs:DescribeServices",
      "ecs:DescribeTaskDefinition",
      "ecs:DescribeTasks",
      "ecs:ListTasks",
      "lambda:ListFunctions",
      "logs:DescribeLogGroups",
      "logs:FilterLogEvents",
      "s3:ListAllMyBuckets",
      "sts:AssumeRole",
    ]);
    expect(awsServicesForCapabilities(AWS_CAPABILITY_IDS)).toEqual([
      "ce",
      "cloudwatch",
      "ec2",
      "ecs",
      "lambda",
      "logs",
      "s3",
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
