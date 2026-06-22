export type AwsCapabilityId =
  | "ce:GetCostAndUsage"
  | "ec2:DescribeInstances"
  | "cloudwatch:DescribeAlarms"
  | "logs:FilterLogEvents"
  | "lambda:ListFunctions"
  | "s3:ListAllMyBuckets"
  | "logs:DescribeLogGroups";

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
    "logs:DescribeLogGroups": {
      id: "logs:DescribeLogGroups",
      iamService: "logs",
      iamAction: "logs:DescribeLogGroups",
      readonly: true,
      costSensitivity: "volume-sensitive",
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
