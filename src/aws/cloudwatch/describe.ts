import { awsRequest } from "../client.js";
import type { AwsCredentials } from "../types.js";
import { normalizeAlarm } from "./parse.js";
import type { CloudWatchAlarm, DescribeAlarmsResponse } from "./types.js";

const MAX_RECORDS = 100;

export async function describeAlarmsInRegion(
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
