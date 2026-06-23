import {
  LOGS_MAX_EVENTS,
  LOGS_MAX_FILTER_PATTERN_LENGTH,
  LOGS_MAX_HOURS,
  LOGS_MAX_LOOKBACK_MINUTES,
  LOG_GROUPS_MAX_COUNT,
  LOG_GROUP_PREFIX_MAX_LENGTH,
  LOG_STREAM_PREFIX_MAX_LENGTH,
} from "../../security/limits.js";
import { LogsError } from "./types.js";

export function validateLogOptions(
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

export function validateLookbackMinutes(lookbackMinutes: number): void {
  if (lookbackMinutes < 1) {
    throw new LogsError("validation_error", "lookbackMinutes must be at least 1.");
  }

  if (lookbackMinutes > LOGS_MAX_LOOKBACK_MINUTES) {
    throw new LogsError(
      "validation_error",
      `lookbackMinutes must not exceed ${LOGS_MAX_LOOKBACK_MINUTES}.`,
    );
  }
}

export function validateFilterPattern(filterPattern: string | undefined): void {
  if (filterPattern === undefined) {
    return;
  }

  if (filterPattern.length > LOGS_MAX_FILTER_PATTERN_LENGTH) {
    throw new LogsError(
      "validation_error",
      `query must not exceed ${LOGS_MAX_FILTER_PATTERN_LENGTH} characters.`,
    );
  }
}

export function validateLogStreamPrefix(logStreamNamePrefix: string | undefined): void {
  if (logStreamNamePrefix === undefined) {
    return;
  }

  if (logStreamNamePrefix.length > LOG_STREAM_PREFIX_MAX_LENGTH) {
    throw new LogsError(
      "validation_error",
      `logStreamNamePrefix must not exceed ${LOG_STREAM_PREFIX_MAX_LENGTH} characters.`,
    );
  }
}

export function validateLogGroupListOptions(
  prefix: string | undefined,
  limit: number,
): void {
  if (prefix !== undefined && prefix.length > LOG_GROUP_PREFIX_MAX_LENGTH) {
    throw new LogsError(
      "validation_error",
      `prefix must not exceed ${LOG_GROUP_PREFIX_MAX_LENGTH} characters.`,
    );
  }

  if (limit < 1) {
    throw new LogsError("validation_error", "limit must be at least 1.");
  }

  if (limit > LOG_GROUPS_MAX_COUNT) {
    throw new LogsError(
      "validation_error",
      `limit must not exceed ${LOG_GROUPS_MAX_COUNT}.`,
    );
  }
}

export function validateDescribeLogStreamsOptions(
  logGroupName: string,
  logStreamNamePrefix: string | undefined,
  limit: number,
): void {
  if (!logGroupName || logGroupName.trim().length === 0) {
    throw new LogsError("validation_error", "logGroupName is required.");
  }

  validateLogStreamPrefix(logStreamNamePrefix);

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
