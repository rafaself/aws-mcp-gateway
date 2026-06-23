import { awsRequest } from "../client.js";
import { AwsRequestError } from "../errors.js";
import {
  LOGS_MAX_EVENTS,
  LOGS_MAX_HOURS,
  LOGS_CACHE_TTL_SECONDS,
  LOG_GROUPS_MAX_COUNT,
} from "../../security/limits.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  validateDescribeLogStreamsOptions,
  validateFilterPattern,
  validateLogGroupListOptions,
  validateLogOptions,
  validateLogStreamPrefix,
} from "./validation.js";
import {
  DEFAULT_FILTER_PATTERN,
  normalizeTimestamp,
  sanitizeLogMessage,
} from "./normalize.js";
import type {
  DescribeLogGroupsResponse,
  DescribeLogStreamsResponse,
  FilterLogEventsResponse,
  FilterLogEventsResult,
  LogGroup,
  LogStream,
} from "./types.js";
import { LogsError } from "./types.js";

function mapLogsRequestError(err: unknown, resourceLabel: string): never {
  if (err instanceof AwsRequestError && (err.statusCode === 400 || err.statusCode === 404)) {
    throw new LogsError("not_found", `${resourceLabel} was not found.`);
  }
  throw err;
}

export async function filterLogEvents(
  logGroupName: string,
  options: {
    filterPattern?: string;
    logStreamNamePrefix?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    cacheTool?: string;
    useDefaultFilterPattern?: boolean;
  },
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<FilterLogEventsResult> {
  const now = Date.now();
  const cacheBucketMs = LOGS_CACHE_TTL_SECONDS * 1000;
  const bucketedNow = Math.floor(now / cacheBucketMs) * cacheBucketMs;
  const endTime = options.endTime ?? bucketedNow;
  const startTime = options.startTime ?? endTime - LOGS_MAX_HOURS * 60 * 60 * 1000;
  const limit = options.limit ?? LOGS_MAX_EVENTS;
  const cacheTool = options.cacheTool ?? "get_recent_log_errors";
  const useDefaultFilterPattern = options.useDefaultFilterPattern ?? true;
  const filterPattern = useDefaultFilterPattern
    ? (options.filterPattern ?? DEFAULT_FILTER_PATTERN)
    : (options.filterPattern ?? "");
  const logStreamNamePrefix = options.logStreamNamePrefix;

  validateLogOptions(logGroupName, startTime, endTime, limit);
  validateFilterPattern(filterPattern);
  validateLogStreamPrefix(logStreamNamePrefix);

  const cacheKey = await buildCacheKey(cacheTool, {
    logGroupName,
    region,
    filterPattern,
    logStreamNamePrefix: logStreamNamePrefix ?? "",
    startTime,
    endTime,
    limit,
  });
  const { value: cached } = await cacheReadWithStatus<FilterLogEventsResult>(cache, cacheKey, execution);
  if (cached) return cached;

  const body: Record<string, unknown> = {
    logGroupName,
    filterPattern,
    startTime,
    endTime,
    limit,
  };

  if (logStreamNamePrefix !== undefined && logStreamNamePrefix.length > 0) {
    body.logStreamNamePrefix = logStreamNamePrefix;
  }

  let response: FilterLogEventsResponse;
  try {
    response = await awsRequest<FilterLogEventsResponse>(
      {
        capability: "logs:FilterLogEvents",
        service: "logs",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": "Logs_20140328.FilterLogEvents",
          "Content-Type": "application/x-amz-json-1.1",
        },
        body,
        execution,
      },
      credentials,
    );
  } catch (err) {
    mapLogsRequestError(err, `Log group "${logGroupName}"`);
  }

  const rawEvents = response.events ?? [];
  const events = rawEvents.slice(0, limit).map((raw) => ({
    logGroupName,
    logStreamName: raw.logStreamName ?? "",
    timestamp: normalizeTimestamp(raw.timestamp),
    message: sanitizeLogMessage(raw.message),
    region,
  }));

  const result: FilterLogEventsResult = {
    events,
    truncated: rawEvents.length >= limit || Boolean(response.nextToken),
  };

  if (cache) {
    await cacheSet(cache, cacheKey, result, LOGS_CACHE_TTL_SECONDS);
  }

  return result;
}

export async function describeLogStreams(
  logGroupName: string,
  options: {
    logStreamNamePrefix?: string;
    limit?: number;
  },
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<LogStream[]> {
  const limit = options.limit ?? 1;
  const logStreamNamePrefix = options.logStreamNamePrefix;

  validateDescribeLogStreamsOptions(logGroupName, logStreamNamePrefix, limit);

  const cacheKey = await buildCacheKey("get_cloudwatch_logs_streams", {
    logGroupName,
    region,
    logStreamNamePrefix: logStreamNamePrefix ?? "",
    limit,
  });
  const { value: cached } = await cacheReadWithStatus<LogStream[]>(cache, cacheKey, execution);
  if (cached) return cached;

  const body: Record<string, unknown> = {
    logGroupName,
    limit,
    orderBy: "LastEventTime",
    descending: true,
  };

  if (logStreamNamePrefix !== undefined && logStreamNamePrefix.length > 0) {
    body.logStreamNamePrefix = logStreamNamePrefix;
  }

  let response: DescribeLogStreamsResponse;
  try {
    response = await awsRequest<DescribeLogStreamsResponse>(
      {
        capability: "logs:DescribeLogStreams",
        service: "logs",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": "Logs_20140328.DescribeLogStreams",
          "Content-Type": "application/x-amz-json-1.1",
        },
        body,
        execution,
      },
      credentials,
    );
  } catch (err) {
    mapLogsRequestError(err, `Log group "${logGroupName}"`);
  }

  const streams = (response.logStreams ?? []).slice(0, limit).map((stream) => ({
    name: stream.logStreamName ?? "",
  }));

  if (cache) {
    await cacheSet(cache, cacheKey, streams, LOGS_CACHE_TTL_SECONDS);
  }

  return streams;
}

export async function describeLogGroups(
  options: {
    prefix?: string;
    limit?: number;
  },
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<LogGroup[]> {
  const limit = options.limit ?? LOG_GROUPS_MAX_COUNT;
  const prefix = options.prefix;

  validateLogGroupListOptions(prefix, limit);

  const cacheKey = await buildCacheKey("list_log_groups", {
    region,
    prefix: prefix ?? "",
    limit,
  });
  const { value: cached } = await cacheReadWithStatus<LogGroup[]>(cache, cacheKey, execution);
  if (cached) return cached;

  const body: Record<string, unknown> = { limit };
  if (prefix !== undefined && prefix.length > 0) {
    body.logGroupNamePrefix = prefix;
  }

  const response = await awsRequest<DescribeLogGroupsResponse>(
    {
      capability: "logs:DescribeLogGroups",
      service: "logs",
      region,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "Logs_20140328.DescribeLogGroups",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body,
      execution,
    },
    credentials,
  );

  const rawGroups = response.logGroups ?? [];
  const logGroups = rawGroups.slice(0, limit).map((group) => ({
    name: group.logGroupName ?? "",
  }));

  logGroups.sort((a, b) => a.name.localeCompare(b.name));

  if (cache) {
    const cacheKey = await buildCacheKey("list_log_groups", {
      region,
      prefix: prefix ?? "",
      limit,
    });
    await cacheSet(cache, cacheKey, logGroups, LOGS_CACHE_TTL_SECONDS);
  }

  return logGroups;
}
