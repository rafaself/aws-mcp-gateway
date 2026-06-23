import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export type AlarmState = "ALARM" | "INSUFFICIENT_DATA" | "OK";

export const VALID_ALARM_STATES: readonly AlarmState[] = [
  "ALARM",
  "INSUFFICIENT_DATA",
  "OK",
] as const;

export interface ListAlarmsOptions {
  regions?: string[];
  stateFilter?: AlarmState[];
}

export interface SummarizeAlarmsOptions {
  alarmNamePrefix?: string;
  stateValue?: AlarmState;
  limit?: number;
}

export interface AlarmStateCounts {
  ALARM: number;
  OK: number;
  INSUFFICIENT_DATA: number;
}

export interface CloudWatchAlarmSummary {
  name: string;
  state: AlarmState;
  metricNamespace: string;
  metricName: string;
  reason: string;
  updatedAt: string;
}

export interface CloudWatchAlarmSummaryResult {
  alarms: CloudWatchAlarmSummary[];
  stateCounts: AlarmStateCounts;
}

export interface CloudWatchAlarm {
  name: string;
  region: string;
  state: AlarmState;
  reason: string;
  updatedAt: string;
  namespace: string;
  metricName: string;
}

export interface DescribeAlarmsResponse {
  MetricAlarms?: Array<{
    AlarmName?: string;
    StateValue?: string;
    StateReason?: string;
    StateUpdatedTimestamp?: string;
    MetricName?: string;
    Namespace?: string;
    AlarmActions?: string[];
    OKActions?: string[];
    InsufficientDataActions?: string[];
  }>;
  NextToken?: string;
}

export class CloudWatchError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "CloudWatchError";
  }
}
