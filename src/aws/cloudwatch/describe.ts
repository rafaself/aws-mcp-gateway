import { awsRequest } from "../client.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import { normalizeAlarm, normalizeAlarmSummary } from "./parse.js";
import type {
  AlarmState,
  CloudWatchAlarm,
  CloudWatchAlarmSummary,
  DescribeAlarmsResponse,
} from "./types.js";

const MAX_RECORDS = 100;

export async function describeAlarmsInRegion(
  region: string,
  stateFilter: string[],
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<CloudWatchAlarm[]> {
  const allAlarms: CloudWatchAlarm[] = [];
  let nextToken: string | undefined;

  const apiStateValue = stateFilter.length === 1 ? stateFilter[0] : undefined;

  do {
    const body: Record<string, unknown> = {
      MaxRecords: MAX_RECORDS,
      AlarmTypes: ["MetricAlarm"],
    };

    if (apiStateValue) {
      body.StateValue = apiStateValue;
    }

    if (nextToken) {
      body.NextToken = nextToken;
    }

    const response = await awsRequest<DescribeAlarmsResponse>(
      {
        capability: "cloudwatch:DescribeAlarms",
        service: "monitoring",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": "GraniteServiceVersion20100801.DescribeAlarms",
          "Content-Type": "application/x-amz-json-1.1",
        },
        body,
        execution,
      },
      credentials,
    );

    const rawAlarms = response.MetricAlarms ?? [];
    for (const raw of rawAlarms) {
      allAlarms.push(normalizeAlarm(raw, region));
    }

    nextToken = response.NextToken;
  } while (nextToken);

  if (stateFilter.length > 1) {
    return allAlarms.filter((a) => stateFilter.includes(a.state));
  }

  return allAlarms;
}

export async function summarizeAlarmsInRegion(
  region: string,
  options: {
    alarmNamePrefix?: string;
    stateValue?: AlarmState;
    limit: number;
  },
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<CloudWatchAlarmSummary[]> {
  const alarms: CloudWatchAlarmSummary[] = [];
  let nextToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      MaxRecords: Math.min(MAX_RECORDS, options.limit - alarms.length),
      AlarmTypes: ["MetricAlarm"],
    };

    if (options.alarmNamePrefix) {
      body.AlarmNamePrefix = options.alarmNamePrefix;
    }

    if (options.stateValue) {
      body.StateValue = options.stateValue;
    }

    if (nextToken) {
      body.NextToken = nextToken;
    }

    const response = await awsRequest<DescribeAlarmsResponse>(
      {
        capability: "cloudwatch:DescribeAlarms",
        service: "monitoring",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": "GraniteServiceVersion20100801.DescribeAlarms",
          "Content-Type": "application/x-amz-json-1.1",
        },
        body,
        execution,
      },
      credentials,
    );

    const rawAlarms = response.MetricAlarms ?? [];
    for (const raw of rawAlarms) {
      alarms.push(normalizeAlarmSummary(raw));
      if (alarms.length >= options.limit) {
        return alarms;
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return alarms;
}
