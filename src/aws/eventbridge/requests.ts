import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import type {
  EventBridgeDescribeRuleResponse,
  EventBridgeListRulesResponse,
  EventBridgeListTargetsByRuleResponse,
  SchedulerGetScheduleResponse,
  SchedulerListSchedulesResponse,
} from "./types.js";
import { EventBridgeError } from "./types.js";

const EVENTBRIDGE_TARGET_PREFIX = "AWSEvents";
const SCHEDULER_TARGET_PREFIX = "AmazonScheduler";
const REQUEST_TIMEOUT_MS = 15_000;

function jsonHeaders(target: string): Record<string, string> {
  return {
    "X-Amz-Target": target,
    "Content-Type": "application/x-amz-json-1.1",
  };
}

function parseAwsErrorType(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { __type?: string };
    const rawType = parsed.__type;
    if (!rawType) return undefined;
    const slash = rawType.lastIndexOf("#");
    return slash >= 0 ? rawType.slice(slash + 1) : rawType;
  } catch {
    return undefined;
  }
}

async function jsonRpcRequest<T>(
  capability: AwsCapabilityId,
  service: string,
  target: string,
  body: Record<string, unknown>,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);

  const client = createAwsClient(credentials, service, region);
  const url = `https://${service}.${region}.amazonaws.com/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "POST",
      headers: jsonHeaders(target),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const awsErrorType = parseAwsErrorType(text);
      if (awsErrorType === "AccessDeniedException" || response.status === 403) {
        throw new EventBridgeError(
          "aws_request_failed",
          "Access denied for EventBridge request.",
          awsErrorType,
        );
      }
      throw new EventBridgeError("aws_request_failed", "EventBridge request failed.", awsErrorType);
    }

    execution?.recordAwsRequest(capability, region);

    if (text.length === 0) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof EventBridgeError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new EventBridgeError("aws_request_failed", "EventBridge request timed out.");
    }

    throw new EventBridgeError("aws_request_failed", "EventBridge request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listRules(
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
  options?: { namePrefix?: string; nextToken?: string; limit?: number },
): Promise<EventBridgeListRulesResponse> {
  const body: Record<string, unknown> = {};
  if (options?.namePrefix) body.NamePrefix = options.namePrefix;
  if (options?.nextToken) body.NextToken = options.nextToken;
  if (options?.limit) body.Limit = options.limit;

  return jsonRpcRequest<EventBridgeListRulesResponse>(
    "events:ListRules",
    "events",
    `${EVENTBRIDGE_TARGET_PREFIX}.ListRules`,
    body,
    region,
    credentials,
    execution,
  );
}

export async function describeRule(
  name: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<EventBridgeDescribeRuleResponse> {
  return jsonRpcRequest<EventBridgeDescribeRuleResponse>(
    "events:DescribeRule",
    "events",
    `${EVENTBRIDGE_TARGET_PREFIX}.DescribeRule`,
    { Name: name },
    region,
    credentials,
    execution,
  );
}

export async function listTargetsByRule(
  ruleName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<EventBridgeListTargetsByRuleResponse> {
  return jsonRpcRequest<EventBridgeListTargetsByRuleResponse>(
    "events:ListTargetsByRule",
    "events",
    `${EVENTBRIDGE_TARGET_PREFIX}.ListTargetsByRule`,
    { Rule: ruleName },
    region,
    credentials,
    execution,
  );
}

export async function listSchedules(
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
  options?: { namePrefix?: string; nextToken?: string; maxResults?: number },
): Promise<SchedulerListSchedulesResponse> {
  const body: Record<string, unknown> = {};
  if (options?.namePrefix) body.NamePrefix = options.namePrefix;
  if (options?.nextToken) body.NextToken = options.nextToken;
  if (options?.maxResults) body.MaxResults = options.maxResults;

  return jsonRpcRequest<SchedulerListSchedulesResponse>(
    "scheduler:ListSchedules",
    "scheduler",
    `${SCHEDULER_TARGET_PREFIX}.ListSchedules`,
    body,
    region,
    credentials,
    execution,
  );
}

export async function getSchedule(
  name: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SchedulerGetScheduleResponse> {
  return jsonRpcRequest<SchedulerGetScheduleResponse>(
    "scheduler:GetSchedule",
    "scheduler",
    `${SCHEDULER_TARGET_PREFIX}.GetSchedule`,
    { Name: name },
    region,
    credentials,
    execution,
  );
}

export function isEventBridgeAccessDeniedError(err: unknown): boolean {
  return err instanceof EventBridgeError && err.awsErrorType === "AccessDeniedException";
}
