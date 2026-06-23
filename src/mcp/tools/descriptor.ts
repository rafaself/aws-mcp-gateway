import { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { withOptionalExecutionMetadata } from "../execution/output-schema.js";
import type { GatewayToolDefinition } from "./registry.js";

export const OAUTH_REQUIRED_SCOPE = "aws:read";

export const OAUTH_SECURITY_SCHEMES = [
  { type: "oauth2" as const, scopes: [OAUTH_REQUIRED_SCOPE] },
] as const;

export type OAuthSecurityScheme = (typeof OAUTH_SECURITY_SCHEMES)[number];
export type ToolSecurityScheme = OAuthSecurityScheme;

export const PUBLIC_TOOL_TITLES = {
  search: "Search AWS MCP Tools",
  fetch: "Fetch AWS MCP Tool Details",
  get_gateway_status: "Get Gateway Status",
  get_aws_cost_summary: "Get AWS Cost Summary",
  get_aws_cost_by_service: "Get AWS Cost by Service",
  list_ec2_instances: "List EC2 Instances",
  get_cloudwatch_alarms: "Get CloudWatch Alarms",
  get_cloudwatch_logs: "Get CloudWatch Logs",
  get_cloudwatch_alarm_summary: "Get CloudWatch Alarm Summary",
  get_recent_log_errors: "Get Recent Log Errors",
  list_lambda_functions: "List Lambda Functions",
  list_s3_buckets: "List S3 Buckets",
  list_log_groups: "List Log Groups",
  get_ecs_service_health: "Get ECS Service Health",
  list_ecs_tasks: "List ECS Tasks",
  get_recent_stopped_ecs_tasks: "Get Recent Stopped ECS Tasks",
  get_rds_instance_health: "Get RDS Instance Health",
  get_rds_metrics: "Get RDS Metrics",
  check_ssm_parameter_inventory: "Check SSM Parameter Inventory",
  get_ecr_image_status: "Get ECR Image Status",
  compare_ecs_task_image_with_ecr: "Compare ECS Task Image With ECR",
  get_s3_bucket_posture: "Get S3 Bucket Posture",
  get_ses_configuration_status: "Get SES Configuration Status",
  get_sns_topic_status: "Get SNS Topic Status",
  get_eventbridge_rules_status: "Get EventBridge Rules Status",
  get_budget_status: "Get Budget Status",
  aws_account_overview: "AWS Account Overview",
  aws_cost_overview: "AWS Cost Overview",
  aws_observability_overview: "AWS Observability Overview",
} as const;

export type PublicToolTitleName = keyof typeof PUBLIC_TOOL_TITLES;

type OAuthToolMetadata = {
  securitySchemes: OAuthSecurityScheme[];
  _meta: { securitySchemes: OAuthSecurityScheme[]; [key: string]: unknown };
  annotations: ToolAnnotations;
};

export const AWS_READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
};

export const STATUS_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

function oauthDescriptorMeta(): Record<string, unknown> {
  return {
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
  };
}

export function withOAuthToolMetadata<T extends Record<string, unknown>>(
  descriptor: T,
  annotations: ToolAnnotations,
): T & OAuthToolMetadata {
  const meta: OAuthToolMetadata["_meta"] = {
    ...oauthDescriptorMeta(),
    ...(typeof descriptor._meta === "object" && descriptor._meta !== null
      ? (descriptor._meta as Record<string, unknown>)
      : {}),
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
  };

  return {
    ...descriptor,
    securitySchemes: [...OAUTH_SECURITY_SCHEMES],
    _meta: meta,
    annotations,
  };
}

export function readOnlyAwsToolDescriptor(
  descriptor: Record<string, unknown>,
): GatewayToolDefinition {
  return withOAuthToolMetadata(descriptor, AWS_READ_ONLY_ANNOTATIONS) as unknown as GatewayToolDefinition;
}

export function localStatusToolDescriptor(
  descriptor: Record<string, unknown>,
): GatewayToolDefinition {
  return withOAuthToolMetadata(descriptor, STATUS_ANNOTATIONS) as unknown as GatewayToolDefinition;
}

export const CHATGPT_DISCOVERY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

export function chatgptDiscoveryToolDescriptor(
  descriptor: Record<string, unknown>,
): GatewayToolDefinition {
  return withOAuthToolMetadata(
    descriptor,
    CHATGPT_DISCOVERY_ANNOTATIONS,
  ) as unknown as GatewayToolDefinition;
}

export const chatgptSearchInputSchema = z.object({
  query: z.string().describe("Natural language search query for AWS read-only MCP tools."),
});

export const chatgptFetchInputSchema = z.object({
  id: z.string().describe("Catalog document id returned by the search tool."),
});

export const chatgptSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
});

export const chatgptFetchOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  url: z.string(),
  metadata: z.record(z.string(), z.string()),
});

export const gatewayStatusOutputSchema = z.object({
  service: z.string(),
  status: z.string(),
  mode: z.string(),
});

export const costPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const costSummaryShape = {
  period: costPeriodSchema,
  granularity: z.enum(["DAILY", "MONTHLY"]),
  total: z.number(),
  currency: z.string(),
} as const;

export const costSummaryOutputSchema = withOptionalExecutionMetadata(costSummaryShape);

export const costByServiceOutputSchema = withOptionalExecutionMetadata({
  ...costSummaryShape,
  services: z.array(
    z.object({
      service: z.string(),
      amount: z.number(),
    }),
  ),
});

export const listEc2InstancesOutputSchema = withOptionalExecutionMetadata({
  regions: z.array(z.string()),
  count: z.number(),
  instances: z.array(
    z.object({
      instanceId: z.string(),
      region: z.string(),
      state: z.string(),
      instanceType: z.string(),
      name: z.string(),
    }),
  ),
});

export const cloudwatchAlarmsOutputSchema = withOptionalExecutionMetadata({
  regions: z.array(z.string()),
  count: z.number(),
  alarms: z.array(
    z.object({
      name: z.string(),
      region: z.string(),
      state: z.enum(["ALARM", "INSUFFICIENT_DATA", "OK"]),
      reason: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const recentLogErrorsOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  logGroupName: z.string(),
  count: z.number(),
  events: z.array(
    z.object({
      timestamp: z.string(),
      logStreamName: z.string(),
      message: z.string(),
    }),
  ),
});

export const cloudwatchLogsOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  logGroupName: z.string(),
  count: z.number(),
  lookbackMinutes: z.number(),
  query: z.string(),
  logStreamNamePrefix: z.string().optional(),
  truncated: z.boolean(),
  events: z.array(
    z.object({
      timestamp: z.string(),
      logStreamName: z.string(),
      message: z.string(),
    }),
  ),
});

export const cloudwatchAlarmSummaryOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  count: z.number(),
  stateCounts: z.object({
    ALARM: z.number(),
    OK: z.number(),
    INSUFFICIENT_DATA: z.number(),
  }),
  alarms: z.array(
    z.object({
      name: z.string(),
      state: z.enum(["ALARM", "INSUFFICIENT_DATA", "OK"]),
      metricNamespace: z.string(),
      metricName: z.string(),
      reason: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

export const listLambdaFunctionsOutputSchema = withOptionalExecutionMetadata({
  regions: z.array(z.string()),
  count: z.number(),
  functions: z.array(
    z.object({
      functionName: z.string(),
      region: z.string(),
      runtime: z.string(),
      state: z.string(),
    }),
  ),
});

export const listS3BucketsOutputSchema = withOptionalExecutionMetadata({
  count: z.number(),
  buckets: z.array(
    z.object({
      name: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const listLogGroupsOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  count: z.number(),
  logGroups: z.array(
    z.object({
      name: z.string(),
    }),
  ),
});

const ecsContainerStatusSchema = z.object({
  name: z.string(),
  lastStatus: z.string(),
  exitCode: z.number().optional(),
  reason: z.string().optional(),
});

export const ecsServiceHealthOutputSchema = withOptionalExecutionMetadata({
  clusterName: z.string(),
  serviceName: z.string(),
  region: z.string(),
  desiredCount: z.number(),
  runningCount: z.number(),
  pendingCount: z.number(),
  deploymentStatus: z.string(),
  rolloutState: z.string(),
  taskDefinition: z.string(),
  launchType: z.string().optional(),
  capacityProviders: z.array(z.string()).optional(),
  events: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      message: z.string(),
    }),
  ),
});

export const listEcsTasksOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  clusterName: z.string(),
  count: z.number(),
  tasks: z.array(
    z.object({
      taskId: z.string(),
      taskDefinition: z.string(),
      lastStatus: z.string(),
      desiredStatus: z.string(),
      healthStatus: z.string().optional(),
      startedAt: z.string().optional(),
      stoppedAt: z.string().optional(),
      stopCode: z.string().optional(),
      stoppedReason: z.string().optional(),
      availabilityZone: z.string().optional(),
      containers: z.array(ecsContainerStatusSchema),
    }),
  ),
});

export const recentStoppedEcsTasksOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  clusterName: z.string(),
  lookbackMinutes: z.number(),
  count: z.number(),
  tasks: z.array(
    z.object({
      taskId: z.string(),
      taskDefinition: z.string(),
      stoppedReason: z.string().optional(),
      stopCode: z.string().optional(),
      startedAt: z.string().optional(),
      stoppedAt: z.string().optional(),
      containers: z.array(ecsContainerStatusSchema),
    }),
  ),
});

export const rdsInstanceHealthOutputSchema = withOptionalExecutionMetadata({
  dbInstanceIdentifier: z.string(),
  region: z.string(),
  status: z.string(),
  engine: z.string(),
  engineVersion: z.string(),
  instanceClass: z.string(),
  allocatedStorageGb: z.number(),
  maxAllocatedStorageGb: z.number().optional(),
  storageEncrypted: z.boolean(),
  publiclyAccessible: z.boolean(),
  multiAz: z.boolean(),
  backupRetentionPeriodDays: z.number(),
  deletionProtection: z.boolean(),
  latestRestorableTime: z.string().optional(),
  dbSubnetGroupName: z.string().optional(),
  vpcId: z.string().optional(),
});

const rdsMetricDatapointSchema = z.object({
  timestamp: z.string(),
  value: z.number(),
});

const rdsMetricSeriesSchema = z.object({
  name: z.string(),
  unit: z.string(),
  status: z.enum(["ok", "no_data"]),
  datapoints: z.array(rdsMetricDatapointSchema),
});

export const rdsMetricsOutputSchema = withOptionalExecutionMetadata({
  dbInstanceIdentifier: z.string(),
  region: z.string(),
  lookbackMinutes: z.number(),
  periodSeconds: z.number(),
  metrics: z.array(rdsMetricSeriesSchema),
});

const ssmParameterInventoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  exists: z.boolean(),
  type: z.string().optional(),
  version: z.number().optional(),
  lastModifiedDate: z.string().optional(),
  keyId: z.string().optional(),
  suspiciousMetadata: z.boolean().optional(),
});

export const checkSsmParameterInventoryOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  parameterPrefix: z.string(),
  missingCount: z.number(),
  parameters: z.array(ssmParameterInventoryEntrySchema),
});

const ecrImageScanSummarySchema = z.object({
  criticalCount: z.number(),
  highCount: z.number(),
});

export const getEcrImageStatusOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  repositoryName: z.string(),
  found: z.boolean(),
  imageDigest: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pushedAt: z.string().optional(),
  imageSizeInBytes: z.number().optional(),
  scanStatus: z.string().optional(),
  scanSummary: ecrImageScanSummarySchema.optional(),
  hasLifecyclePolicy: z.boolean().optional(),
});

export const compareEcsTaskImageWithEcrOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  clusterName: z.string(),
  serviceName: z.string(),
  repositoryName: z.string(),
  taskDefinitionImage: z.string().optional(),
  runningTaskImageDigests: z.array(z.string()),
  ecrImageDigest: z.string().optional(),
  ecrImageTags: z.array(z.string()).optional(),
  ecrImageFound: z.boolean(),
  matchesEcrDigest: z.boolean(),
  matchesExpectedDigest: z.boolean().nullable(),
});

const s3PublicAccessBlockSchema = z.object({
  blockPublicAcls: z.boolean(),
  ignorePublicAcls: z.boolean(),
  blockPublicPolicy: z.boolean(),
  restrictPublicBuckets: z.boolean(),
});

const s3LifecycleRuleSummarySchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const getS3BucketPostureOutputSchema = withOptionalExecutionMetadata({
  bucketName: z.string(),
  region: z.string(),
  bucketExists: z.boolean(),
  publicAccessBlock: s3PublicAccessBlockSchema.optional(),
  encryption: z
    .object({
      configured: z.boolean(),
      algorithm: z.string().optional(),
      kmsKeyId: z.string().optional(),
    })
    .optional(),
  versioning: z
    .object({
      status: z.string(),
    })
    .optional(),
  lifecycle: z
    .object({
      ruleCount: z.number(),
      rules: z.array(s3LifecycleRuleSummarySchema),
    })
    .optional(),
  isPublic: z.boolean().optional(),
  tlsOnlyPolicyIndicator: z.literal("unknown"),
  metrics: z
    .object({
      bucketSizeBytes: z.number().optional(),
      objectCount: z.number().optional(),
      asOf: z.string().optional(),
    })
    .optional(),
});

const sesEventDestinationSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  matchingEventTypes: z.array(z.string()),
  destinationType: z.string(),
  snsTopicArn: z.string().optional(),
});

export const getSesConfigurationStatusOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  configurationSetName: z.string(),
  configurationSetExists: z.boolean(),
  sendingEnabled: z.boolean().optional(),
  reputationMetricsEnabled: z.boolean().optional(),
  tlsPolicy: z.string().optional(),
  eventDestinations: z.array(sesEventDestinationSchema),
});

const snsSubscriptionSummarySchema = z.object({
  protocol: z.string(),
  endpointMasked: z.string(),
  pendingConfirmation: z.boolean(),
});

const topicPolicySummarySchema = z.object({
  statementCount: z.number(),
  allowsPublish: z.boolean(),
  principalTypes: z.array(z.string()),
});

export const getSnsTopicStatusOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  topicName: z.string().optional(),
  topicArn: z.string().optional(),
  topicExists: z.boolean(),
  subscriptionCount: z.number(),
  protocols: z.array(z.string()),
  pendingConfirmationCount: z.number(),
  subscriptions: z.array(snsSubscriptionSummarySchema),
  policySummary: topicPolicySummarySchema.optional(),
});

const eventBridgeTargetSummarySchema = z.object({
  id: z.string().optional(),
  arn: z.string().optional(),
  roleArn: z.string().optional(),
});

const eventBridgeRuleSummarySchema = z.object({
  name: z.string(),
  state: z.string(),
  scheduleExpression: z.string().optional(),
  eventPatternSummary: z.string().optional(),
  targetCount: z.number(),
  targets: z.array(eventBridgeTargetSummarySchema),
});

const schedulerScheduleSummarySchema = z.object({
  name: z.string(),
  state: z.string(),
  scheduleExpression: z.string().optional(),
  targetArn: z.string().optional(),
  targetRoleArn: z.string().optional(),
});

export const getEventBridgeRulesStatusOutputSchema = withOptionalExecutionMetadata({
  region: z.string(),
  rules: z.array(eventBridgeRuleSummarySchema),
  schedules: z.array(schedulerScheduleSummarySchema),
  truncated: z.boolean(),
});

const budgetSubscriberSummarySchema = z.object({
  type: z.string(),
  addressMasked: z.string(),
});

const budgetNotificationSummarySchema = z.object({
  notificationType: z.string(),
  comparisonOperator: z.string().optional(),
  threshold: z.number().optional(),
  thresholdType: z.string().optional(),
  subscribers: z.array(budgetSubscriberSummarySchema),
});

export const getBudgetStatusOutputSchema = withOptionalExecutionMetadata({
  accountId: z.string(),
  budgetName: z.string(),
  budgetExists: z.boolean(),
  limitAmount: z.string().optional(),
  limitUnit: z.string().optional(),
  actualSpend: z.string().optional(),
  forecastedSpend: z.string().optional(),
  timeUnit: z.string().optional(),
  notifications: z.array(budgetNotificationSummarySchema),
});

const overviewEc2SectionSchema = z.object({
  count: z.number(),
  countsByState: z.record(z.string(), z.number()),
  countsByRegion: z.record(z.string(), z.number()),
  sample: z.array(
    z.object({
      instanceId: z.string(),
      region: z.string(),
      state: z.string(),
      instanceType: z.string(),
      name: z.string(),
    }),
  ),
});

const overviewLambdaSectionSchema = z.object({
  count: z.number(),
  countsByRegion: z.record(z.string(), z.number()),
  sample: z.array(
    z.object({
      functionName: z.string(),
      region: z.string(),
      runtime: z.string(),
      state: z.string(),
    }),
  ),
});

const overviewS3SectionSchema = z.object({
  count: z.number(),
  sample: z.array(
    z.object({
      name: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const awsAccountOverviewOutputSchema = withOptionalExecutionMetadata({
  regions: z.array(z.string()),
  ec2: overviewEc2SectionSchema.optional(),
  lambda: overviewLambdaSectionSchema.optional(),
  s3: overviewS3SectionSchema.optional(),
});

export const awsCostOverviewOutputSchema = withOptionalExecutionMetadata({
  period: costPeriodSchema,
  granularity: z.enum(["DAILY", "MONTHLY"]),
  total: z.number(),
  currency: z.string(),
  services: z.array(
    z.object({
      service: z.string(),
      amount: z.number(),
    }),
  ),
});

const overviewAlarmSampleSchema = z.object({
  name: z.string(),
  region: z.string(),
  state: z.enum(["ALARM", "INSUFFICIENT_DATA", "OK"]),
  reason: z.string(),
  updatedAt: z.string(),
});

const overviewAlarmsSectionSchema = z.object({
  count: z.number(),
  countsByState: z.record(z.string(), z.number()),
  sample: z.array(overviewAlarmSampleSchema),
});

const overviewLogGroupsSectionSchema = z.object({
  count: z.number(),
  sample: z.array(
    z.object({
      name: z.string(),
      region: z.string(),
    }),
  ),
});

export const awsObservabilityOverviewOutputSchema = withOptionalExecutionMetadata({
  regions: z.array(z.string()),
  alarms: overviewAlarmsSectionSchema.optional(),
  logGroups: overviewLogGroupsSectionSchema.optional(),
});
