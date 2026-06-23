import { createAwsClient } from "../aws-client.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import {
  assertAwsCapability,
  AwsCapabilityError,
  type AwsCapabilityId,
} from "../capabilities.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import { parseDescribeDbInstancesResponse, parseDescribeDbSubnetGroupsResponse } from "./xml.js";
import type {
  RdsDescribeDbInstancesResponse,
  RdsDescribeDbSubnetGroupsResponse,
} from "./types.js";

const RDS_API_VERSION = "2014-10-31";
const RDS_REQUEST_TIMEOUT_MS = 30_000;

type RdsCapability = "rds:DescribeDBInstances" | "rds:DescribeDBSubnetGroups";

const CAPABILITY_ACTIONS: Record<RdsCapability, string> = {
  "rds:DescribeDBInstances": "DescribeDBInstances",
  "rds:DescribeDBSubnetGroups": "DescribeDBSubnetGroups",
};

export async function rdsFetch<T extends RdsDescribeDbInstancesResponse | RdsDescribeDbSubnetGroupsResponse>(
  capability: RdsCapability,
  params: Record<string, string>,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);
  const action = CAPABILITY_ACTIONS[capability];
  if (!action) {
    throw new AwsCapabilityError(`Unsupported RDS capability: ${capability}`);
  }

  const client = createAwsClient(credentials, "rds", region);
  const url = new URL(`https://rds.${region}.amazonaws.com/`);

  const bodyParams = new URLSearchParams({
    Action: action,
    Version: RDS_API_VERSION,
    ...params,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RDS_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: bodyParams.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `RDS request failed in ${region}.`,
        retryable: response.status >= 500,
        statusCode: response.status,
        service: "rds",
        region,
      });
    }

    execution?.recordAwsRequest(capability as AwsCapabilityId, region);

    const text = await response.text();
    if (text.length === 0) {
      return {} as T;
    }

    if (capability === "rds:DescribeDBInstances") {
      return parseDescribeDbInstancesResponse(text) as T;
    }

    return parseDescribeDbSubnetGroupsResponse(text) as T;
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `RDS request timed out in ${region}.`,
        retryable: true,
        statusCode: 0,
        service: "rds",
        region,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: `RDS request failed in ${region}.`,
      retryable: false,
      statusCode: 0,
      service: "rds",
      region,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
