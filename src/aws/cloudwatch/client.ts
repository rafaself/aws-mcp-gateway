import { resolveRegions } from "../../security/regions.js";
import { AwsRequestError } from "../errors.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { CW_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { describeAlarmsInRegion, summarizeAlarmsInRegion } from "./describe.js";
import { buildStateCounts, compareAlarmSummaries, compareAlarms } from "./parse.js";
import {
  CloudWatchError,
  VALID_ALARM_STATES,
  type AlarmState,
  type CloudWatchAlarm,
  type CloudWatchAlarmSummaryResult,
  type ListAlarmsOptions,
  type SummarizeAlarmsOptions,
} from "./types.js";
import { validateAlarmLimit, validateAlarmNamePrefix } from "./validation.js";

function validateStateFilters(states: string[]): void {
  const valid = VALID_ALARM_STATES as readonly string[];
  for (const state of states) {
    if (!valid.includes(state)) {
      throw new CloudWatchError(
        "validation_error",
        `Invalid alarm state "${state}". Valid states: ${VALID_ALARM_STATES.join(", ")}`,
      );
    }
  }
}

export async function listAlarms(
  options: ListAlarmsOptions,
  allowedRegions: string[],
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<CloudWatchAlarm[]> {
  if (options.stateFilter && options.stateFilter.length > 0) {
    validateStateFilters(options.stateFilter);
  }

  const regions = resolveRegions(options.regions, allowedRegions);
  const sortedRegions = [...regions].sort();
  const sortedStateFilter = (options.stateFilter ?? []).slice().sort();
  const stateFilter = options.stateFilter ?? [];

  const cacheKey = await buildCacheKey("get_cloudwatch_alarms", {
    regions: sortedRegions,
    stateFilter: sortedStateFilter,
  });
  const { value: cached } = await cacheReadWithStatus<CloudWatchAlarm[]>(cache, cacheKey, execution);
  if (cached) return cached;

  const outcomes = await Promise.allSettled(
    regions.map((region) =>
      describeAlarmsInRegion(region, stateFilter, credentials, execution),
    ),
  );

  const allAlarms: CloudWatchAlarm[] = [];
  const errors: Array<{ region: string; reason: unknown }> = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === "fulfilled") {
      allAlarms.push(...outcome.value);
    } else {
      errors.push({ region: regions[i], reason: outcome.reason });
    }
  }

  if (allAlarms.length === 0 && errors.length > 0) {
    const firstError = errors[0].reason;
    if (firstError instanceof AwsRequestError) {
      throw firstError;
    }
    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "CloudWatch request failed in all regions.",
      retryable: false,
      statusCode: 0,
      service: "monitoring",
    });
  }

  allAlarms.sort(compareAlarms);

  if (cache) {
    const cacheKey = await buildCacheKey("get_cloudwatch_alarms", {
      regions: sortedRegions,
      stateFilter: sortedStateFilter,
    });
    await cacheSet(cache, cacheKey, allAlarms, CW_CACHE_TTL_SECONDS);
  }

  return allAlarms;
}

function validateStateValue(stateValue: AlarmState | undefined): void {
  if (stateValue === undefined) {
    return;
  }

  if (!VALID_ALARM_STATES.includes(stateValue)) {
    throw new CloudWatchError(
      "validation_error",
      `Invalid alarm state "${stateValue}". Valid states: ${VALID_ALARM_STATES.join(", ")}`,
    );
  }
}

export async function summarizeAlarms(
  region: string,
  options: SummarizeAlarmsOptions,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<CloudWatchAlarmSummaryResult> {
  const limit = options.limit ?? 50;
  validateAlarmLimit(limit);
  validateAlarmNamePrefix(options.alarmNamePrefix);
  validateStateValue(options.stateValue);

  const cacheKey = await buildCacheKey("get_cloudwatch_alarm_summary", {
    region,
    alarmNamePrefix: options.alarmNamePrefix ?? "",
    stateValue: options.stateValue ?? "",
    limit,
  });
  const { value: cached } = await cacheReadWithStatus<CloudWatchAlarmSummaryResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) return cached;

  const alarms = await summarizeAlarmsInRegion(
    region,
    {
      alarmNamePrefix: options.alarmNamePrefix,
      stateValue: options.stateValue,
      limit,
    },
    credentials,
    execution,
  );

  alarms.sort(compareAlarmSummaries);

  const result: CloudWatchAlarmSummaryResult = {
    alarms,
    stateCounts: buildStateCounts(alarms),
  };

  if (cache) {
    await cacheSet(cache, cacheKey, result, CW_CACHE_TTL_SECONDS);
  }

  return result;
}
