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
