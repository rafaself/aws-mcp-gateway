import { awsRequest } from "../client.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS, LOGS_CACHE_TTL_SECONDS, LOG_GROUPS_MAX_COUNT } from "../../security/limits.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheGet, cacheSet } from "../../cache/kv.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { validateLogOptions, validateLogGroupListOptions } from "./validation.js";
import { DEFAULT_FILTER_PATTERN, normalizeTimestamp, truncateMessage } from "./normalize.js";
import type { LogEvent, FilterLogEventsResponse, LogGroup, DescribeLogGroupsResponse } from "./types.js";

export async function filterLogEvents(
  logGroupName: string,
  options: {
    filterPattern?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  },
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
): Promise<LogEvent[]> {
  const now = Date.now();
  const cacheBucketMs = LOGS_CACHE_TTL_SECONDS * 1000;
  const bucketedNow = Math.floor(now / cacheBucketMs) * cacheBucketMs;
  const endTime = options.endTime ?? bucketedNow;
  const startTime = options.startTime ?? endTime - LOGS_MAX_HOURS * 60 * 60 * 1000;
  const limit = options.limit ?? LOGS_MAX_EVENTS;
  const filterPattern = options.filterPattern ?? DEFAULT_FILTER_PATTERN;

  validateLogOptions(logGroupName, startTime, endTime, limit);

  if (cache) {
    const cacheKey = await buildCacheKey("get_recent_log_errors", {
      logGroupName,
      region,
      filterPattern,
      startTime,
      endTime,
      limit,
    });
    const cached = await cacheGet<LogEvent[]>(cache, cacheKey);
    if (cached) return cached;
  }

  const body: Record<string, unknown> = {
    logGroupName,
    filterPattern,
    startTime,
    endTime,
    limit,
  };

  const response = await awsRequest<FilterLogEventsResponse>(
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
    },
    credentials,
  );

  const rawEvents = response.events ?? [];
  const events = rawEvents.slice(0, limit).map((raw) => ({
    logGroupName,
    logStreamName: raw.logStreamName ?? "",
    timestamp: normalizeTimestamp(raw.timestamp),
    message: truncateMessage(raw.message),
    region,
  }));

  if (cache) {
    const cacheKey = await buildCacheKey("get_recent_log_errors", {
      logGroupName,
      region,
      filterPattern,
      startTime,
      endTime,
      limit,
    });
    await cacheSet(cache, cacheKey, events, LOGS_CACHE_TTL_SECONDS);
  }

  return events;
}

export async function describeLogGroups(
  options: {
    prefix?: string;
    limit?: number;
  },
  region: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
): Promise<LogGroup[]> {
  const limit = options.limit ?? LOG_GROUPS_MAX_COUNT;
  const prefix = options.prefix;

  validateLogGroupListOptions(prefix, limit);

  if (cache) {
    const cacheKey = await buildCacheKey("list_log_groups", {
      region,
      prefix: prefix ?? "",
      limit,
    });
    const cached = await cacheGet<LogGroup[]>(cache, cacheKey);
    if (cached) return cached;
  }

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
