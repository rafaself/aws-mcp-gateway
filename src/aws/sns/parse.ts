import { maskSubscriptionEndpoint, summarizeTopicPolicy } from "../../security/masking.js";
import type {
  SnsGetTopicAttributesResponse,
  SnsListSubscriptionsByTopicResponse,
  SnsSubscriptionSummary,
  SnsTopicStatusResult,
} from "./types.js";
import { extractTopicNameFromArn } from "./validation.js";

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function attributesMap(
  response: SnsGetTopicAttributesResponse,
): Record<string, string> {
  const result =
    response.GetTopicAttributesResponse?.GetTopicAttributesResult ??
    response.GetTopicAttributesResult;
  const entries = toArray(result?.Attributes?.entry);
  const map: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.key && entry.value !== undefined) {
      map[entry.key] = entry.value;
    }
  }
  return map;
}

function normalizeSubscription(
  raw: {
    Protocol?: string;
    Endpoint?: string;
    SubscriptionArn?: string;
    PendingConfirmation?: string;
  },
): SnsSubscriptionSummary {
  const protocol = raw.Protocol ?? "unknown";
  return {
    protocol,
    endpointMasked: maskSubscriptionEndpoint(raw.Endpoint ?? "", protocol),
    pendingConfirmation:
      raw.PendingConfirmation === "true" ||
      raw.SubscriptionArn === "PendingConfirmation",
  };
}

export function buildNotFoundTopicStatus(
  region: string,
  topicName?: string,
  topicArn?: string,
): SnsTopicStatusResult {
  return {
    region,
    topicName,
    topicArn,
    topicExists: false,
    subscriptionCount: 0,
    protocols: [],
    pendingConfirmationCount: 0,
    subscriptions: [],
  };
}

export function normalizeTopicStatus(
  region: string,
  topicArn: string,
  attributesResponse: SnsGetTopicAttributesResponse,
  subscriptionsResponse: SnsListSubscriptionsByTopicResponse,
): SnsTopicStatusResult {
  const attributes = attributesMap(attributesResponse);
  const rawSubscriptions = toArray(
    (
      subscriptionsResponse.ListSubscriptionsByTopicResponse?.ListSubscriptionsByTopicResult ??
      subscriptionsResponse.ListSubscriptionsByTopicResult
    )?.Subscriptions?.member,
  );
  const subscriptions = rawSubscriptions.map(normalizeSubscription);
  const protocols = [...new Set(subscriptions.map((s) => s.protocol))].sort();
  const pendingConfirmationCount = subscriptions.filter((s) => s.pendingConfirmation).length;

  return {
    region,
    topicName: extractTopicNameFromArn(topicArn),
    topicArn,
    topicExists: true,
    subscriptionCount: subscriptions.length,
    protocols,
    pendingConfirmationCount,
    subscriptions,
    policySummary: summarizeTopicPolicy(attributes.Policy),
  };
}
