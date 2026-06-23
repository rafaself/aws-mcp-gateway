export { listAlarms, summarizeAlarms } from "./client.js";
export { CloudWatchError, VALID_ALARM_STATES } from "./types.js";
export type {
  AlarmState,
  ListAlarmsOptions,
  SummarizeAlarmsOptions,
  CloudWatchAlarm,
  CloudWatchAlarmSummary,
  CloudWatchAlarmSummaryResult,
  AlarmStateCounts,
} from "./types.js";
