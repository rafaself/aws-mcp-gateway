import {
  RDS_DB_INSTANCE_ID_MAX_LENGTH,
  RDS_DEFAULT_LOOKBACK_MINUTES,
  RDS_DEFAULT_PERIOD_SECONDS,
  RDS_MAX_LOOKBACK_MINUTES,
  RDS_MAX_PERIOD_SECONDS,
  RDS_MIN_PERIOD_SECONDS,
} from "../../security/limits.js";
import { RdsError } from "./types.js";

export function validateDbInstanceIdentifier(dbInstanceIdentifier: string): void {
  const trimmed = dbInstanceIdentifier?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new RdsError("validation_error", "dbInstanceIdentifier is required.");
  }
  if (trimmed.length > RDS_DB_INSTANCE_ID_MAX_LENGTH) {
    throw new RdsError(
      "validation_error",
      `dbInstanceIdentifier must not exceed ${RDS_DB_INSTANCE_ID_MAX_LENGTH} characters.`,
    );
  }
}

export function validateLookbackMinutes(lookbackMinutes: number | undefined): number {
  const resolved = lookbackMinutes ?? RDS_DEFAULT_LOOKBACK_MINUTES;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RdsError("validation_error", "lookbackMinutes must be at least 1.");
  }
  if (resolved > RDS_MAX_LOOKBACK_MINUTES) {
    throw new RdsError(
      "validation_error",
      `lookbackMinutes must not exceed ${RDS_MAX_LOOKBACK_MINUTES}.`,
    );
  }
  return resolved;
}

export function validatePeriodSeconds(periodSeconds: number | undefined): number {
  const resolved = periodSeconds ?? RDS_DEFAULT_PERIOD_SECONDS;
  if (!Number.isInteger(resolved) || resolved < RDS_MIN_PERIOD_SECONDS) {
    throw new RdsError(
      "validation_error",
      `periodSeconds must be at least ${RDS_MIN_PERIOD_SECONDS}.`,
    );
  }
  if (resolved > RDS_MAX_PERIOD_SECONDS) {
    throw new RdsError(
      "validation_error",
      `periodSeconds must not exceed ${RDS_MAX_PERIOD_SECONDS}.`,
    );
  }
  return resolved;
}
