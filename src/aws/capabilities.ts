export type AwsCapabilityId =
  | "ce:GetCostAndUsage"
  | "ec2:DescribeInstances"
  | "cloudwatch:DescribeAlarms"
  | "logs:FilterLogEvents"
  | "lambda:ListFunctions"
  | "s3:ListAllMyBuckets"
  | "s3:GetBucketLocation"
  | "s3:GetBucketPublicAccessBlock"
  | "s3:GetBucketEncryption"
  | "s3:GetBucketVersioning"
  | "s3:GetLifecycleConfiguration"
  | "s3:GetBucketPolicyStatus"
  | "ecr:DescribeImages"
  | "ecr:DescribeImageScanFindings"
  | "ecr:GetLifecyclePolicy"
  | "logs:DescribeLogGroups"
  | "logs:DescribeLogStreams"
  | "ecs:DescribeClusters"
  | "ecs:DescribeServices"
  | "ecs:ListTasks"
  | "ecs:DescribeTasks"
  | "ecs:DescribeTaskDefinition"
  | "rds:DescribeDBInstances"
  | "rds:DescribeDBSubnetGroups"
  | "cloudwatch:GetMetricData"
  | "ssm:DescribeParameters"
  | "ssm:GetParameters"
  | "sts:AssumeRole"
  | "ses:GetConfigurationSet"
  | "ses:GetConfigurationSetEventDestinations"
  | "sns:ListTopics"
  | "sns:GetTopicAttributes"
  | "sns:ListSubscriptionsByTopic"
  | "events:ListRules"
  | "events:DescribeRule"
  | "events:ListTargetsByRule"
  | "scheduler:ListSchedules"
  | "scheduler:GetSchedule"
  | "budgets:DescribeBudgets"
  | "budgets:DescribeNotificationsForBudget"
  | "budgets:DescribeSubscribersForNotification";

export type AwsCapabilityCostSensitivity =
  | "paid"
  | "fanout-sensitive"
  | "volume-sensitive"
  | "low";

export type AwsCapabilityDefinition = {
  id: AwsCapabilityId;
  iamService: string;
  iamAction: string;
  requestService?: string;
  readonly: true;
  costSensitivity: AwsCapabilityCostSensitivity;
};

const WRITE_ACTION_PREFIXES = [
  "Create",
  "Put",
  "Delete",
  "Update",
  "Terminate",
  "Start",
  "Stop",
  "Attach",
  "Detach",
  "Modify",
  "Run",
  "Purchase",
  "Cancel",
  "Revoke",
  "Enable",
  "Disable",
] as const;

export const AWS_CAPABILITY_REGISTRY: Readonly<Record<AwsCapabilityId, AwsCapabilityDefinition>> =
  {
    "ce:GetCostAndUsage": {
      id: "ce:GetCostAndUsage",
      iamService: "ce",
      iamAction: "ce:GetCostAndUsage",
      readonly: true,
      costSensitivity: "paid",
    },
    "ec2:DescribeInstances": {
      id: "ec2:DescribeInstances",
      iamService: "ec2",
      iamAction: "ec2:DescribeInstances",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "cloudwatch:DescribeAlarms": {
      id: "cloudwatch:DescribeAlarms",
      iamService: "cloudwatch",
      iamAction: "cloudwatch:DescribeAlarms",
      requestService: "monitoring",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "logs:FilterLogEvents": {
      id: "logs:FilterLogEvents",
      iamService: "logs",
      iamAction: "logs:FilterLogEvents",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "lambda:ListFunctions": {
      id: "lambda:ListFunctions",
      iamService: "lambda",
      iamAction: "lambda:ListFunctions",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "s3:ListAllMyBuckets": {
      id: "s3:ListAllMyBuckets",
      iamService: "s3",
      iamAction: "s3:ListAllMyBuckets",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetBucketLocation": {
      id: "s3:GetBucketLocation",
      iamService: "s3",
      iamAction: "s3:GetBucketLocation",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetBucketPublicAccessBlock": {
      id: "s3:GetBucketPublicAccessBlock",
      iamService: "s3",
      iamAction: "s3:GetBucketPublicAccessBlock",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetBucketEncryption": {
      id: "s3:GetBucketEncryption",
      iamService: "s3",
      iamAction: "s3:GetBucketEncryption",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetBucketVersioning": {
      id: "s3:GetBucketVersioning",
      iamService: "s3",
      iamAction: "s3:GetBucketVersioning",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetLifecycleConfiguration": {
      id: "s3:GetLifecycleConfiguration",
      iamService: "s3",
      iamAction: "s3:GetLifecycleConfiguration",
      readonly: true,
      costSensitivity: "low",
    },
    "s3:GetBucketPolicyStatus": {
      id: "s3:GetBucketPolicyStatus",
      iamService: "s3",
      iamAction: "s3:GetBucketPolicyStatus",
      readonly: true,
      costSensitivity: "low",
    },
    "ecr:DescribeImages": {
      id: "ecr:DescribeImages",
      iamService: "ecr",
      iamAction: "ecr:DescribeImages",
      readonly: true,
      costSensitivity: "low",
    },
    "ecr:DescribeImageScanFindings": {
      id: "ecr:DescribeImageScanFindings",
      iamService: "ecr",
      iamAction: "ecr:DescribeImageScanFindings",
      readonly: true,
      costSensitivity: "low",
    },
    "ecr:GetLifecyclePolicy": {
      id: "ecr:GetLifecyclePolicy",
      iamService: "ecr",
      iamAction: "ecr:GetLifecyclePolicy",
      readonly: true,
      costSensitivity: "low",
    },
    "logs:DescribeLogGroups": {
      id: "logs:DescribeLogGroups",
      iamService: "logs",
      iamAction: "logs:DescribeLogGroups",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "logs:DescribeLogStreams": {
      id: "logs:DescribeLogStreams",
      iamService: "logs",
      iamAction: "logs:DescribeLogStreams",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "ecs:DescribeClusters": {
      id: "ecs:DescribeClusters",
      iamService: "ecs",
      iamAction: "ecs:DescribeClusters",
      readonly: true,
      costSensitivity: "low",
    },
    "ecs:DescribeServices": {
      id: "ecs:DescribeServices",
      iamService: "ecs",
      iamAction: "ecs:DescribeServices",
      readonly: true,
      costSensitivity: "low",
    },
    "ecs:ListTasks": {
      id: "ecs:ListTasks",
      iamService: "ecs",
      iamAction: "ecs:ListTasks",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "ecs:DescribeTasks": {
      id: "ecs:DescribeTasks",
      iamService: "ecs",
      iamAction: "ecs:DescribeTasks",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "ecs:DescribeTaskDefinition": {
      id: "ecs:DescribeTaskDefinition",
      iamService: "ecs",
      iamAction: "ecs:DescribeTaskDefinition",
      readonly: true,
      costSensitivity: "low",
    },
    "rds:DescribeDBInstances": {
      id: "rds:DescribeDBInstances",
      iamService: "rds",
      iamAction: "rds:DescribeDBInstances",
      readonly: true,
      costSensitivity: "low",
    },
    "rds:DescribeDBSubnetGroups": {
      id: "rds:DescribeDBSubnetGroups",
      iamService: "rds",
      iamAction: "rds:DescribeDBSubnetGroups",
      readonly: true,
      costSensitivity: "low",
    },
    "cloudwatch:GetMetricData": {
      id: "cloudwatch:GetMetricData",
      iamService: "cloudwatch",
      iamAction: "cloudwatch:GetMetricData",
      requestService: "monitoring",
      readonly: true,
      costSensitivity: "volume-sensitive",
    },
    "ssm:DescribeParameters": {
      id: "ssm:DescribeParameters",
      iamService: "ssm",
      iamAction: "ssm:DescribeParameters",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "ssm:GetParameters": {
      id: "ssm:GetParameters",
      iamService: "ssm",
      iamAction: "ssm:GetParameters",
      readonly: true,
      costSensitivity: "low",
    },
    "sts:AssumeRole": {
      id: "sts:AssumeRole",
      iamService: "sts",
      iamAction: "sts:AssumeRole",
      readonly: true,
      costSensitivity: "low",
    },
    "ses:GetConfigurationSet": {
      id: "ses:GetConfigurationSet",
      iamService: "ses",
      iamAction: "ses:GetConfigurationSet",
      requestService: "email",
      readonly: true,
      costSensitivity: "low",
    },
    "ses:GetConfigurationSetEventDestinations": {
      id: "ses:GetConfigurationSetEventDestinations",
      iamService: "ses",
      iamAction: "ses:GetConfigurationSetEventDestinations",
      requestService: "email",
      readonly: true,
      costSensitivity: "low",
    },
    "sns:ListTopics": {
      id: "sns:ListTopics",
      iamService: "sns",
      iamAction: "sns:ListTopics",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "sns:GetTopicAttributes": {
      id: "sns:GetTopicAttributes",
      iamService: "sns",
      iamAction: "sns:GetTopicAttributes",
      readonly: true,
      costSensitivity: "low",
    },
    "sns:ListSubscriptionsByTopic": {
      id: "sns:ListSubscriptionsByTopic",
      iamService: "sns",
      iamAction: "sns:ListSubscriptionsByTopic",
      readonly: true,
      costSensitivity: "low",
    },
    "events:ListRules": {
      id: "events:ListRules",
      iamService: "events",
      iamAction: "events:ListRules",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "events:DescribeRule": {
      id: "events:DescribeRule",
      iamService: "events",
      iamAction: "events:DescribeRule",
      readonly: true,
      costSensitivity: "low",
    },
    "events:ListTargetsByRule": {
      id: "events:ListTargetsByRule",
      iamService: "events",
      iamAction: "events:ListTargetsByRule",
      readonly: true,
      costSensitivity: "low",
    },
    "scheduler:ListSchedules": {
      id: "scheduler:ListSchedules",
      iamService: "scheduler",
      iamAction: "scheduler:ListSchedules",
      readonly: true,
      costSensitivity: "fanout-sensitive",
    },
    "scheduler:GetSchedule": {
      id: "scheduler:GetSchedule",
      iamService: "scheduler",
      iamAction: "scheduler:GetSchedule",
      readonly: true,
      costSensitivity: "low",
    },
    "budgets:DescribeBudgets": {
      id: "budgets:DescribeBudgets",
      iamService: "budgets",
      iamAction: "budgets:DescribeBudgets",
      readonly: true,
      costSensitivity: "low",
    },
    "budgets:DescribeNotificationsForBudget": {
      id: "budgets:DescribeNotificationsForBudget",
      iamService: "budgets",
      iamAction: "budgets:DescribeNotificationsForBudget",
      readonly: true,
      costSensitivity: "low",
    },
    "budgets:DescribeSubscribersForNotification": {
      id: "budgets:DescribeSubscribersForNotification",
      iamService: "budgets",
      iamAction: "budgets:DescribeSubscribersForNotification",
      readonly: true,
      costSensitivity: "low",
    },
  };

export const AWS_CAPABILITY_IDS = Object.keys(AWS_CAPABILITY_REGISTRY) as AwsCapabilityId[];

export class AwsCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AwsCapabilityError";
  }
}

export function isAwsCapabilityId(value: string): value is AwsCapabilityId {
  return Object.prototype.hasOwnProperty.call(AWS_CAPABILITY_REGISTRY, value);
}

export function getAwsCapability(id: AwsCapabilityId): AwsCapabilityDefinition {
  const capability = AWS_CAPABILITY_REGISTRY[id];
  if (!capability) {
    throw new AwsCapabilityError(`Unknown AWS capability: ${id}`);
  }
  return capability;
}

export function assertAwsCapability(id: string): AwsCapabilityId {
  if (!isAwsCapabilityId(id)) {
    throw new AwsCapabilityError(`Unknown AWS capability: ${id}`);
  }
  return id;
}

export function awsActionsForCapabilities(ids: readonly AwsCapabilityId[]): string[] {
  return [...new Set(ids.map((id) => getAwsCapability(id).iamAction))].sort();
}

export function awsServicesForCapabilities(ids: readonly AwsCapabilityId[]): string[] {
  return [...new Set(ids.map((id) => getAwsCapability(id).iamService))].sort();
}

export function isReadOnlyIamAction(action: string): boolean {
  const actionName = action.includes(":") ? action.split(":")[1] : action;
  if (!actionName) {
    return false;
  }

  return !WRITE_ACTION_PREFIXES.some((prefix) => actionName.startsWith(prefix));
}
