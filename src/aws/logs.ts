import { awsRequest } from "./client.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS, LOGS_MAX_MESSAGE_LENGTH, LOGS_CACHE_TTL_SECONDS } from "../security/limits.js";
import { LogsError, type LogEvent, type FilterLogEventsResponse } from "./logs-types.js";
import { buildCacheKey } from "../cache/keys.js";
import { cacheGet, cacheSet } from "../cache/kv.js";
import type { AwsCredentials } from "./types.js";
import type { KVNamespace } from "@cloudflare/workers-types";

const DEFAULT_FILTER_PATTERN = "?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn";

function validateLogOptions(
  logGroupName: string,
  startTime: number,
  endTime: number,
  limit: number,
): void {
  if (!logGroupName || logGroupName.trim().length === 0) {
    throw new LogsError("validation_error", "logGroupName is required.");
  }

  if (startTime >= endTime) {
    throw new LogsError("validation_error", "startTime must be before endTime.");
  }

  const diffMs = endTime - startTime;
  const maxMs = LOGS_MAX_HOURS * 60 * 60 * 1000;
  if (diffMs > maxMs) {
    throw new LogsError(
      "validation_error",
      `Time range must not exceed ${LOGS_MAX_HOURS} hours.`,
    );
  }

  if (limit < 1) {
    throw new LogsError("validation_error", "limit must be at least 1.");
  }

  if (limit > LOGS_MAX_EVENTS) {
    throw new LogsError(
      "validation_error",
      `limit must not exceed ${LOGS_MAX_EVENTS}.`,
    );
  }
}

function normalizeTimestamp(epochMs: number | undefined): string {
  if (epochMs === undefined) return "";
  return new Date(epochMs).toISOString();
}

function truncateMessage(message: string | undefined): string {
  if (!message) return "";
  if (message.length <= LOGS_MAX_MESSAGE_LENGTH) return message;
  const suffix = "...";
  return message.slice(0, LOGS_MAX_MESSAGE_LENGTH - suffix.length) + suffix;
}

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
