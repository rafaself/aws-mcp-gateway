import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import {
  extractErrorCode,
  parseGetTopicAttributesResponse,
  parseListSubscriptionsByTopicResponse,
  parseListTopicsResponse,
} from "./xml.js";
import type {
  SnsGetTopicAttributesResponse,
  SnsListSubscriptionsByTopicResponse,
  SnsListTopicsResponse,
} from "./types.js";
import { SnsError } from "./types.js";

const SNS_API_VERSION = "2010-03-31";
const SNS_REQUEST_TIMEOUT_MS = 15_000;

type SnsCapability =
  | "sns:ListTopics"
  | "sns:GetTopicAttributes"
  | "sns:ListSubscriptionsByTopic";

const CAPABILITY_ACTIONS: Record<SnsCapability, string> = {
  "sns:ListTopics": "ListTopics",
  "sns:GetTopicAttributes": "GetTopicAttributes",
  "sns:ListSubscriptionsByTopic": "ListSubscriptionsByTopic",
};

async function snsFetch<T>(
  capability: SnsCapability,
  params: Record<string, string>,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);
  const action = CAPABILITY_ACTIONS[capability];

  const client = createAwsClient(credentials, "sns", region);
  const url = new URL(`https://sns.${region}.amazonaws.com/`);

  const bodyParams = new URLSearchParams({
    Action: action,
    Version: SNS_API_VERSION,
    ...params,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SNS_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: bodyParams.toString(),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const errorCode = extractErrorCode(text);
      if (errorCode === "NotFound" || errorCode === "NotFoundException") {
        throw new SnsError("not_found", "SNS topic was not found.", errorCode);
      }
      if (errorCode === "AuthorizationError" || errorCode === "AccessDenied") {
        throw new SnsError(
          "aws_request_failed",
          "Access denied for SNS topic request.",
          errorCode,
        );
      }
      throw new SnsError("aws_request_failed", "SNS request failed.", errorCode);
    }

    execution?.recordAwsRequest(capability as AwsCapabilityId, region);

    if (text.length === 0) {
      return {} as T;
    }

    if (capability === "sns:ListTopics") {
      return parseListTopicsResponse(text) as T;
    }
    if (capability === "sns:GetTopicAttributes") {
      return parseGetTopicAttributesResponse(text) as T;
    }
    return parseListSubscriptionsByTopicResponse(text) as T;
  } catch (err) {
    if (err instanceof SnsError || err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new SnsError("aws_request_failed", "SNS request timed out.");
    }

    throw new SnsError("aws_request_failed", "SNS request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listTopics(
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
  nextToken?: string,
): Promise<SnsListTopicsResponse> {
  const params: Record<string, string> = {};
  if (nextToken) {
    params.NextToken = nextToken;
  }
  return snsFetch<SnsListTopicsResponse>(
    "sns:ListTopics",
    params,
    region,
    credentials,
    execution,
  );
}

export async function getTopicAttributes(
  topicArn: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SnsGetTopicAttributesResponse> {
  return snsFetch<SnsGetTopicAttributesResponse>(
    "sns:GetTopicAttributes",
    { TopicArn: topicArn },
    region,
    credentials,
    execution,
  );
}

export async function listSubscriptionsByTopic(
  topicArn: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SnsListSubscriptionsByTopicResponse> {
  return snsFetch<SnsListSubscriptionsByTopicResponse>(
    "sns:ListSubscriptionsByTopic",
    { TopicArn: topicArn },
    region,
    credentials,
    execution,
  );
}

export function isSnsNotFoundError(err: unknown): boolean {
  return err instanceof SnsError && err.code === "not_found";
}

export function isSnsAccessDeniedError(err: unknown): boolean {
  return (
    err instanceof SnsError &&
    (err.awsErrorType === "AuthorizationError" || err.awsErrorType === "AccessDenied")
  );
}
