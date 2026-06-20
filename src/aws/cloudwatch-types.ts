import { ValidationError } from "../security/errors.js";

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
  }>;
  NextToken?: string;
}

export class CloudWatchError extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "CloudWatchError";
  }
}
