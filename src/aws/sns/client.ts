import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { SNS_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import { buildNotFoundTopicStatus, normalizeTopicStatus } from "./parse.js";
import {
  getTopicAttributes,
  isSnsNotFoundError,
  listSubscriptionsByTopic,
  listTopics,
} from "./requests.js";
import type { SnsTopicStatusResult } from "./types.js";
import { extractTopicNameFromArn, validateTopicInput } from "./validation.js";

function toTopicMembers(
  response: Awaited<ReturnType<typeof listTopics>>,
): Array<{ TopicArn?: string }> {
  const listResult =
    response.ListTopicsResponse?.ListTopicsResult ?? response.ListTopicsResult;
  const members = listResult?.Topics?.member;
  if (!members) return [];
  return Array.isArray(members) ? members : [members];
}

async function resolveTopicArn(
  topicName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<string | undefined> {
  let nextToken: string | undefined;

  do {
    const response = await listTopics(region, credentials, execution, nextToken);
    const match = toTopicMembers(response).find(
      (topic) => topic.TopicArn && extractTopicNameFromArn(topic.TopicArn) === topicName,
    );
    if (match?.TopicArn) {
      return match.TopicArn;
    }
    const listResult =
      response.ListTopicsResponse?.ListTopicsResult ?? response.ListTopicsResult;
    nextToken = listResult?.NextToken;
  } while (nextToken);

  return undefined;
}

export async function getTopicStatus(
  input: { topicName?: string; topicArn?: string; region: string },
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
  cacheOptions?: { roleArn?: string },
): Promise<SnsTopicStatusResult> {
  const validated = validateTopicInput(input);
  const region = input.region;

  const cacheKey = await buildCacheKey("get_sns_topic_status", {
    topicName: validated.topicName,
    topicArn: validated.topicArn,
    region,
    ...(cacheOptions?.roleArn ? { roleArn: cacheOptions.roleArn } : {}),
  });
  const { value: cached } = await cacheReadWithStatus<SnsTopicStatusResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  let topicArn = validated.topicArn;
  if (!topicArn && validated.topicName) {
    topicArn = await resolveTopicArn(validated.topicName, region, credentials, execution);
    if (!topicArn) {
      const result = buildNotFoundTopicStatus(region, validated.topicName);
      if (cache) {
        await cacheSet(cache, cacheKey, result, SNS_CACHE_TTL_SECONDS);
      }
      return result;
    }
  }

  try {
    const [attributes, subscriptions] = await Promise.all([
      getTopicAttributes(topicArn!, region, credentials, execution),
      listSubscriptionsByTopic(topicArn!, region, credentials, execution),
    ]);

    const result = normalizeTopicStatus(region, topicArn!, attributes, subscriptions);
    if (cache) {
      await cacheSet(cache, cacheKey, result, SNS_CACHE_TTL_SECONDS);
    }
    return result;
  } catch (err) {
    if (isSnsNotFoundError(err)) {
      const result = buildNotFoundTopicStatus(
        region,
        validated.topicName ?? extractTopicNameFromArn(topicArn!),
        topicArn,
      );
      if (cache) {
        await cacheSet(cache, cacheKey, result, SNS_CACHE_TTL_SECONDS);
      }
      return result;
    }
    throw err;
  }
}
