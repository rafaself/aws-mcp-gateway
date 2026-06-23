import { maskArn } from "../../security/masking.js";
import type {
  SesConfigurationStatusResult,
  SesEventDestinationSummary,
  SesGetConfigurationSetResponse,
  SesGetEventDestinationsResponse,
} from "./types.js";

function normalizeEventDestination(
  raw: NonNullable<SesGetEventDestinationsResponse["EventDestinations"]>[number],
): SesEventDestinationSummary {
  let destinationType = "unknown";
  let snsTopicArn: string | undefined;

  if (raw.SnsDestination?.TopicArn) {
    destinationType = "sns";
    snsTopicArn = maskArn(raw.SnsDestination.TopicArn);
  } else if (raw.EventBridgeDestination) {
    destinationType = "eventbridge";
  } else if (raw.CloudWatchDestination) {
    destinationType = "cloudwatch";
  } else if (raw.KinesisFirehoseDestination) {
    destinationType = "kinesis-firehose";
  } else if (raw.PinpointDestination) {
    destinationType = "pinpoint";
  }

  return {
    name: raw.Name ?? "unknown",
    enabled: raw.Enabled ?? false,
    matchingEventTypes: raw.MatchingEventTypes ?? [],
    destinationType,
    ...(snsTopicArn ? { snsTopicArn } : {}),
  };
}

export function buildNotFoundConfigurationStatus(
  region: string,
  configurationSetName: string,
): SesConfigurationStatusResult {
  return {
    region,
    configurationSetName,
    configurationSetExists: false,
    eventDestinations: [],
  };
}

export function normalizeConfigurationStatus(
  region: string,
  configurationSetName: string,
  configSet: SesGetConfigurationSetResponse,
  eventDestinations: SesGetEventDestinationsResponse,
): SesConfigurationStatusResult {
  return {
    region,
    configurationSetName,
    configurationSetExists: true,
    sendingEnabled: configSet.SendingOptions?.SendingEnabled,
    reputationMetricsEnabled: configSet.ReputationOptions?.ReputationMetricsEnabled,
    tlsPolicy: configSet.DeliveryOptions?.TlsPolicy,
    eventDestinations: (eventDestinations.EventDestinations ?? []).map(normalizeEventDestination),
  };
}
