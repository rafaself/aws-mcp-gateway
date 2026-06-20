import { awsRequest } from "./client.js";
import { resolveRegions } from "../security/regions.js";
import { AwsRequestError } from "./errors.js";
import type { AwsCredentials } from "./types.js";
import {
  CloudWatchError,
  VALID_ALARM_STATES,
  type AlarmState,
  type CloudWatchAlarm,
  type DescribeAlarmsResponse,
  type ListAlarmsOptions,
} from "./cloudwatch-types.js";

const MAX_RECORDS = 100;

const STATE_ORDER: Record<string, number> = {
  ALARM: 0,
  INSUFFICIENT_DATA: 1,
  OK: 2,
};

function validateStateFilters(states: string[]): void {
  const valid = VALID_ALARM_STATES as readonly string[];
  for (const state of states) {
    if (!valid.includes(state)) {
      throw new CloudWatchError(
        "invalid_state_filter",
        `Invalid alarm state "${state}". Valid states: ${VALID_ALARM_STATES.join(", ")}`,
      );
    }
  }
}

function normalizeAlarm(
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

async function describeAlarmsInRegion(
  region: string,
  stateFilter: string[],
  credentials: AwsCredentials,
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
        service: "monitoring",
        region,
        method: "POST",
        path: "/",
        headers: {
          "X-Amz-Target": "GraniteServiceVersion20100801.DescribeAlarms",
          "Content-Type": "application/x-amz-json-1.1",
        },
        body,
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

export async function listAlarms(
  options: ListAlarmsOptions,
  allowedRegions: string[],
  credentials: AwsCredentials,
): Promise<CloudWatchAlarm[]> {
  if (options.stateFilter && options.stateFilter.length > 0) {
    validateStateFilters(options.stateFilter);
  }

  const regions = resolveRegions(options.regions, allowedRegions);
  const stateFilter = options.stateFilter ?? [];

  const outcomes = await Promise.allSettled(
    regions.map((region) =>
      describeAlarmsInRegion(region, stateFilter, credentials),
    ),
  );

  const allAlarms: CloudWatchAlarm[] = [];
  const errors: Array<{ region: string; reason: unknown }> = [];

  for (let i = 0; i < outcomes.length; i++) {
    const outcome = outcomes[i];
    if (outcome.status === "fulfilled") {
      allAlarms.push(...outcome.value);
    } else {
      errors.push({ region: regions[i], reason: outcome.reason });
    }
  }

  if (allAlarms.length === 0 && errors.length > 0) {
    const firstError = errors[0].reason;
    if (firstError instanceof AwsRequestError) {
      throw firstError;
    }
    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "CloudWatch request failed in all regions.",
      retryable: false,
      statusCode: 0,
      service: "monitoring",
    });
  }

  allAlarms.sort((a, b) => {
    const stateCmp =
      (STATE_ORDER[a.state] ?? 3) - (STATE_ORDER[b.state] ?? 3);
    if (stateCmp !== 0) return stateCmp;
    const regionCmp = a.region.localeCompare(b.region);
    if (regionCmp !== 0) return regionCmp;
    return a.name.localeCompare(b.name);
  });

  return allAlarms;
}
