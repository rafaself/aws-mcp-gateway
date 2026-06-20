import type { AlarmState, CloudWatchAlarm, DescribeAlarmsResponse } from "./types.js";

export const STATE_ORDER: Record<string, number> = {
  ALARM: 0,
  INSUFFICIENT_DATA: 1,
  OK: 2,
};

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

export function compareAlarms(a: CloudWatchAlarm, b: CloudWatchAlarm): number {
  const stateCmp =
    (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
  if (stateCmp !== 0) return stateCmp;
  const regionCmp = a.region.localeCompare(b.region);
  if (regionCmp !== 0) return regionCmp;
  return a.name.localeCompare(b.name);
}
