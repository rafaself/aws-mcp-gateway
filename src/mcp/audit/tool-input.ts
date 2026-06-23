export function sanitizeNoInput(): Record<string, unknown> {
  return {};
}

export function summarizeCostDateRangeInput(args: {
  granularity?: string;
  limit?: number;
}): Record<string, unknown> {
  return {
    hasDateRange: true,
    granularity: args.granularity,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeRegionListInput(args: {
  regions?: string[];
  states?: string[];
}): Record<string, unknown> {
  return {
    regionCount: args.regions?.length ?? "all",
    stateFilter: args.states,
  };
}

export function summarizeLogErrorsInput(args: {
  hours?: number;
  limit?: number;
}): Record<string, unknown> {
  return {
    hasLogGroupName: true,
    hours: args.hours,
    limit: args.limit,
  };
}

export function summarizeCloudwatchLogsInput(args: {
  logStreamNamePrefix?: string;
  query?: string;
  lookbackMinutes?: number;
  limit?: number;
}): Record<string, unknown> {
  return {
    hasLogGroupName: true,
    prefixLength: args.logStreamNamePrefix?.length ?? 0,
    hasQuery: Boolean(args.query && args.query.length > 0),
    lookbackMinutes: args.lookbackMinutes,
    limit: args.limit,
  };
}

export function summarizeCloudwatchAlarmSummaryInput(args: {
  alarmNamePrefix?: string;
  stateValue?: string;
  limit?: number;
}): Record<string, unknown> {
  return {
    prefixLength: args.alarmNamePrefix?.length ?? 0,
    stateValue: args.stateValue,
    limit: args.limit,
  };
}

export function summarizeS3BucketsInput(args: {
  limit?: number;
}): Record<string, unknown> {
  return {
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeLogGroupsInput(args: {
  prefix?: string;
  limit?: number;
}): Record<string, unknown> {
  return {
    prefixLength: args.prefix?.length ?? 0,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeAccountOverviewInput(args: {
  regions?: string[];
  include?: string[];
}): Record<string, unknown> {
  return {
    regionCount: args.regions?.length ?? "all",
    includeCount: args.include?.length ?? 1,
    include: args.include ?? ["ec2"],
  };
}

export function summarizeCostOverviewInput(args: {
  granularity?: string;
  serviceLimit?: number;
}): Record<string, unknown> {
  return {
    hasDateRange: true,
    granularity: args.granularity,
    ...(args.serviceLimit !== undefined ? { serviceLimit: args.serviceLimit } : {}),
  };
}

export function summarizeObservabilityOverviewInput(args: {
  regions?: string[];
  include?: string[];
  limit?: number;
}): Record<string, unknown> {
  return {
    regionCount: args.regions?.length ?? "all",
    include: args.include ?? ["alarms"],
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeEcsServiceHealthInput(args: {
  clusterName?: string;
  serviceName?: string;
}): Record<string, unknown> {
  return {
    hasClusterName: Boolean(args.clusterName),
    hasServiceName: Boolean(args.serviceName),
  };
}

export function summarizeEcsTasksInput(args: {
  serviceName?: string;
  desiredStatus?: string;
  limit?: number;
}): Record<string, unknown> {
  return {
    hasServiceName: Boolean(args.serviceName),
    desiredStatus: args.desiredStatus,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeEcsStoppedTasksInput(args: {
  serviceName?: string;
  lookbackMinutes?: number;
  limit?: number;
}): Record<string, unknown> {
  return {
    hasServiceName: Boolean(args.serviceName),
    lookbackMinutes: args.lookbackMinutes,
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
  };
}

export function summarizeRdsInstanceHealthInput(args: {
  dbInstanceIdentifier?: string;
}): Record<string, unknown> {
  return {
    hasDbInstanceIdentifier: Boolean(args.dbInstanceIdentifier),
  };
}

export function summarizeRdsMetricsInput(args: {
  dbInstanceIdentifier?: string;
  lookbackMinutes?: number;
  periodSeconds?: number;
}): Record<string, unknown> {
  return {
    hasDbInstanceIdentifier: Boolean(args.dbInstanceIdentifier),
    lookbackMinutes: args.lookbackMinutes,
    ...(args.periodSeconds !== undefined ? { periodSeconds: args.periodSeconds } : {}),
  };
}

export function summarizeSsmParameterInventoryInput(args: {
  parameterPrefix?: string;
  requiredParameterNames?: string[];
}): Record<string, unknown> {
  return {
    prefixLength: args.parameterPrefix?.length ?? 0,
    requiredParameterCount: args.requiredParameterNames?.length ?? 0,
  };
}

export function summarizeEcrImageStatusInput(args: {
  repositoryName?: string;
  imageTag?: string;
  imageDigest?: string;
}): Record<string, unknown> {
  return {
    hasRepositoryName: Boolean(args.repositoryName),
    hasImageTag: Boolean(args.imageTag),
    hasImageDigest: Boolean(args.imageDigest),
  };
}

export function summarizeEcsEcrImageCompareInput(args: {
  clusterName?: string;
  serviceName?: string;
  repositoryName?: string;
  expectedImageDigest?: string;
}): Record<string, unknown> {
  return {
    hasClusterName: Boolean(args.clusterName),
    hasServiceName: Boolean(args.serviceName),
    hasRepositoryName: Boolean(args.repositoryName),
    hasExpectedImageDigest: Boolean(args.expectedImageDigest),
  };
}

export function summarizeS3BucketPostureInput(args: {
  bucketName?: string;
}): Record<string, unknown> {
  return {
    bucketNameLength: args.bucketName?.length ?? 0,
  };
}
