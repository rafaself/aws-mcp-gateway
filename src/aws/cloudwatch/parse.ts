import { CW_ALARM_REASON_MAX_LENGTH } from "../../security/limits.js";
import { redactSensitiveText } from "../../security/redaction.js";
import type { AlarmState, CloudWatchAlarm, CloudWatchAlarmSummary, DescribeAlarmsResponse } from "./types.js";

export const STATE_ORDER: Record<string, number> = {
  ALARM: 0,
  INSUFFICIENT_DATA: 1,
  OK: 2,
};

const ARN_PATTERN = /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{0,12}:[^\s,;]+/gi;

export function maskActionTargets(text: string): string {
  if (!text) return "";
  return redactSensitiveText(text).replace(ARN_PATTERN, "[REDACTED_ARN]");
}

function truncateReason(reason: string): string {
  if (reason.length <= CW_ALARM_REASON_MAX_LENGTH) return reason;
  return `${reason.slice(0, CW_ALARM_REASON_MAX_LENGTH - 3)}...`;
}

export function normalizeAlarm(
  raw: NonNullable<DescribeAlarmsResponse["MetricAlarms"]>[number],
  region: string,
): CloudWatchAlarm {
  return {
    name: raw.AlarmName ?? "unknown",
    region,
    state: (raw.StateValue ?? "OK") as AlarmState,
    reason: raw.StateReason ?? "",
    updatedAt: raw.StateUpdatedTimestamp ?? "",
    namespace: raw.Namespace ?? "",
    metricName: raw.MetricName ?? "",
  };
}

export function normalizeAlarmSummary(
  raw: NonNullable<DescribeAlarmsResponse["MetricAlarms"]>[number],
): CloudWatchAlarmSummary {
  const reason = truncateReason(maskActionTargets(raw.StateReason ?? ""));
  return {
    name: raw.AlarmName ?? "unknown",
    state: (raw.StateValue ?? "OK") as AlarmState,
    metricNamespace: raw.Namespace ?? "",
    metricName: raw.MetricName ?? "",
    reason,
    updatedAt: raw.StateUpdatedTimestamp ?? "",
  };
}

export function compareAlarms(a: CloudWatchAlarm, b: CloudWatchAlarm): number {
  const stateCmp =
    (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
  if (stateCmp !== 0) return stateCmp;
  const regionCmp = a.region.localeCompare(b.region);
  if (regionCmp !== 0) return regionCmp;
  return a.name.localeCompare(b.name);
}

export function compareAlarmSummaries(
  a: CloudWatchAlarmSummary,
  b: CloudWatchAlarmSummary,
): number {
  const stateCmp =
    (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
  if (stateCmp !== 0) return stateCmp;
  return a.name.localeCompare(b.name);
}

export function buildStateCounts(
  alarms: CloudWatchAlarmSummary[],
): { ALARM: number; OK: number; INSUFFICIENT_DATA: number } {
  return alarms.reduce(
    (counts, alarm) => {
      counts[alarm.state] += 1;
      return counts;
    },
    { ALARM: 0, OK: 0, INSUFFICIENT_DATA: 0 },
  );
}
