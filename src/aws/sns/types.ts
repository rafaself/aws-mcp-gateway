import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";
import type { TopicPolicySummary } from "../../security/masking.js";

export interface SnsSubscriptionSummary {
  protocol: string;
  endpointMasked: string;
  pendingConfirmation: boolean;
}

export interface SnsTopicStatusResult {
  region: string;
  topicName?: string;
  topicArn?: string;
  topicExists: boolean;
  subscriptionCount: number;
  protocols: string[];
  pendingConfirmationCount: number;
  subscriptions: SnsSubscriptionSummary[];
  policySummary?: TopicPolicySummary;
}

export interface SnsListTopicsResponse {
  ListTopicsResponse?: {
    ListTopicsResult?: {
      Topics?: { member?: Array<{ TopicArn?: string }> | { TopicArn?: string } };
      NextToken?: string;
    };
  };
  ListTopicsResult?: {
    Topics?: { member?: Array<{ TopicArn?: string }> | { TopicArn?: string } };
    NextToken?: string;
  };
}

export interface SnsGetTopicAttributesResponse {
  GetTopicAttributesResponse?: {
    GetTopicAttributesResult?: {
      Attributes?: {
        entry?: Array<{ key?: string; value?: string }> | { key?: string; value?: string };
      };
    };
  };
  GetTopicAttributesResult?: {
    Attributes?: {
      entry?: Array<{ key?: string; value?: string }> | { key?: string; value?: string };
    };
  };
}

export interface SnsListSubscriptionsByTopicResponse {
  ListSubscriptionsByTopicResponse?: {
    ListSubscriptionsByTopicResult?: {
      Subscriptions?: {
        member?: Array<{
          Protocol?: string;
          Endpoint?: string;
          SubscriptionArn?: string;
          PendingConfirmation?: string;
        }> | {
          Protocol?: string;
          Endpoint?: string;
          SubscriptionArn?: string;
          PendingConfirmation?: string;
        };
      };
      NextToken?: string;
    };
  };
  ListSubscriptionsByTopicResult?: {
    Subscriptions?: {
      member?: Array<{
        Protocol?: string;
        Endpoint?: string;
        SubscriptionArn?: string;
        PendingConfirmation?: string;
      }> | {
        Protocol?: string;
        Endpoint?: string;
        SubscriptionArn?: string;
        PendingConfirmation?: string;
      };
    };
    NextToken?: string;
  };
}

export class SnsError extends ValidationError {
  public readonly awsErrorType?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorType?: string) {
    super(code, message);
    this.name = "SnsError";
    this.awsErrorType = awsErrorType;
  }
}
