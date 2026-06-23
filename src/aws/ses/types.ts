import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface SesEventDestinationSummary {
  name: string;
  enabled: boolean;
  matchingEventTypes: string[];
  destinationType: string;
  snsTopicArn?: string;
}

export interface SesConfigurationStatusResult {
  region: string;
  configurationSetName: string;
  configurationSetExists: boolean;
  sendingEnabled?: boolean;
  reputationMetricsEnabled?: boolean;
  tlsPolicy?: string;
  eventDestinations: SesEventDestinationSummary[];
}

export interface SesGetConfigurationSetResponse {
  ConfigurationSetName?: string;
  SendingOptions?: { SendingEnabled?: boolean };
  ReputationOptions?: { ReputationMetricsEnabled?: boolean };
  DeliveryOptions?: { TlsPolicy?: string };
}

export interface SesGetEventDestinationsResponse {
  EventDestinations?: Array<{
    Name?: string;
    Enabled?: boolean;
    MatchingEventTypes?: string[];
    SnsDestination?: { TopicArn?: string };
    EventBridgeDestination?: { EventBusArn?: string };
    CloudWatchDestination?: { DimensionConfigurations?: unknown[] };
    KinesisFirehoseDestination?: { DeliveryStreamArn?: string };
    PinpointDestination?: { ApplicationArn?: string };
  }>;
}

export class SesError extends ValidationError {
  public readonly awsErrorType?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorType?: string) {
    super(code, message);
    this.name = "SesError";
    this.awsErrorType = awsErrorType;
  }
}
