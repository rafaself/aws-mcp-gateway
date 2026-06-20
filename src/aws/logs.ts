import { awsRequest } from "./client.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS, LOGS_MAX_MESSAGE_LENGTH } from "../security/limits.js";
import { LogsError, type LogEvent, type FilterLogEventsResponse } from "./logs-types.js";
import type { AwsCredentials } from "./types.js";

const DEFAULT_FILTER_PATTERN = "?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn";

function validateLogOptions(
  logGroupName: string,
  startTime: number,
  endTime: number,
  limit: number,
): void {
  if (!logGroupName || logGroupName.trim().length === 0) {
    throw new LogsError("missing_log_group", "logGroupName is required.");
  }

  if (startTime >= endTime) {
    throw new LogsError("invalid_time_range", "startTime must be before endTime.");
  }

  const diffMs = endTime - startTime;
  const maxMs = LOGS_MAX_HOURS * 60 * 60 * 1000;
  if (diffMs > maxMs) {
    throw new LogsError(
      "time_range_exceeded",
      `Time range must not exceed ${LOGS_MAX_HOURS} hours.`,
    );
  }

  if (limit < 1) {
    throw new LogsError("invalid_limit", "limit must be at least 1.");
  }

  if (limit > LOGS_MAX_EVENTS) {
    throw new LogsError(
      "limit_exceeded",
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
): Promise<LogEvent[]> {
  const now = Date.now();
  const startTime = options.startTime ?? now - LOGS_MAX_HOURS * 60 * 60 * 1000;
  const endTime = options.endTime ?? now;
  const limit = options.limit ?? LOGS_MAX_EVENTS;

  validateLogOptions(logGroupName, startTime, endTime, limit);

  const body: Record<string, unknown> = {
    logGroupName,
    filterPattern: options.filterPattern ?? DEFAULT_FILTER_PATTERN,
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

  return rawEvents.slice(0, limit).map((raw) => ({
    logGroupName,
    logStreamName: raw.logStreamName ?? "",
    timestamp: normalizeTimestamp(raw.timestamp),
    message: truncateMessage(raw.message),
    region,
  }));
}
