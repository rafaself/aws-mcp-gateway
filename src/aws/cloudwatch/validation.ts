import { CW_ALARM_PREFIX_MAX_LENGTH, CW_MAX_ALARMS } from "../../security/limits.js";
import { CloudWatchError } from "./types.js";

export function validateAlarmNamePrefix(alarmNamePrefix: string | undefined): void {
  if (alarmNamePrefix === undefined) {
    return;
  }

  if (alarmNamePrefix.length > CW_ALARM_PREFIX_MAX_LENGTH) {
    throw new CloudWatchError(
      "validation_error",
      `alarmNamePrefix must not exceed ${CW_ALARM_PREFIX_MAX_LENGTH} characters.`,
    );
  }
}

export function validateAlarmLimit(limit: number): void {
  if (limit < 1) {
    throw new CloudWatchError("validation_error", "limit must be at least 1.");
  }

  if (limit > CW_MAX_ALARMS) {
    throw new CloudWatchError(
      "validation_error",
      `limit must not exceed ${CW_MAX_ALARMS}.`,
    );
  }
}
