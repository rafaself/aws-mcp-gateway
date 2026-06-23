import {
  ECS_MAX_LOOKBACK_MINUTES,
  ECS_MAX_TASKS,
} from "../../security/limits.js";
import { EcsError, type EcsDesiredStatus } from "./types.js";

const DESIRED_STATUSES: readonly EcsDesiredStatus[] = ["RUNNING", "PENDING", "STOPPED"];

export function validateClusterName(clusterName: string): void {
  if (!clusterName || clusterName.trim().length === 0) {
    throw new EcsError("validation_error", "clusterName is required.");
  }
}

export function validateServiceName(serviceName: string): void {
  if (!serviceName || serviceName.trim().length === 0) {
    throw new EcsError("validation_error", "serviceName is required.");
  }
}

export function validateDesiredStatus(status: string | undefined): EcsDesiredStatus | undefined {
  if (status === undefined) return undefined;
  if (!DESIRED_STATUSES.includes(status as EcsDesiredStatus)) {
    throw new EcsError(
      "validation_error",
      `desiredStatus must be one of: ${DESIRED_STATUSES.join(", ")}.`,
    );
  }
  return status as EcsDesiredStatus;
}

export function validateTaskLimit(limit: number | undefined): number {
  const resolved = limit ?? ECS_MAX_TASKS;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new EcsError("validation_error", "limit must be at least 1.");
  }
  if (resolved > ECS_MAX_TASKS) {
    throw new EcsError(
      "validation_error",
      `limit must not exceed ${ECS_MAX_TASKS}.`,
    );
  }
  return resolved;
}

export function validateLookbackMinutes(lookbackMinutes: number | undefined): number {
  const resolved = lookbackMinutes ?? 60;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new EcsError("validation_error", "lookbackMinutes must be at least 1.");
  }
  if (resolved > ECS_MAX_LOOKBACK_MINUTES) {
    throw new EcsError(
      "validation_error",
      `lookbackMinutes must not exceed ${ECS_MAX_LOOKBACK_MINUTES}.`,
    );
  }
  return resolved;
}
