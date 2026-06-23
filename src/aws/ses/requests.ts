import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import type {
  SesGetConfigurationSetResponse,
  SesGetEventDestinationsResponse,
} from "./types.js";
import { SesError } from "./types.js";

const SES_REQUEST_TIMEOUT_MS = 15_000;

function parseSesErrorType(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { message?: string; Message?: string };
    const message = parsed.message ?? parsed.Message ?? "";
    if (message.includes("NotFoundException")) return "NotFoundException";
    if (message.includes("AccessDenied")) return "AccessDeniedException";
    return undefined;
  } catch {
    return undefined;
  }
}

async function sesGetRequest<T>(
  capability: AwsCapabilityId,
  path: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);

  const client = createAwsClient(credentials, "email", region);
  const url = `https://email.${region}.amazonaws.com${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SES_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const awsErrorType = parseSesErrorType(text);
      if (response.status === 404 || awsErrorType === "NotFoundException") {
        throw new SesError("not_found", "SES configuration set was not found.", awsErrorType);
      }
      if (response.status === 403 || awsErrorType === "AccessDeniedException") {
        throw new SesError(
          "aws_request_failed",
          "Access denied for SES configuration set request.",
          awsErrorType,
        );
      }
      throw new SesError("aws_request_failed", "SES request failed.", awsErrorType);
    }

    execution?.recordAwsRequest(capability, region);

    if (text.length === 0) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof SesError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new SesError("aws_request_failed", "SES request timed out.");
    }

    throw new SesError("aws_request_failed", "SES request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getConfigurationSet(
  configurationSetName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SesGetConfigurationSetResponse> {
  const encoded = encodeURIComponent(configurationSetName);
  return sesGetRequest<SesGetConfigurationSetResponse>(
    "ses:GetConfigurationSet",
    `/v2/email/configuration-sets/${encoded}`,
    region,
    credentials,
    execution,
  );
}

export async function getConfigurationSetEventDestinations(
  configurationSetName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<SesGetEventDestinationsResponse> {
  const encoded = encodeURIComponent(configurationSetName);
  return sesGetRequest<SesGetEventDestinationsResponse>(
    "ses:GetConfigurationSetEventDestinations",
    `/v2/email/configuration-sets/${encoded}/event-destinations`,
    region,
    credentials,
    execution,
  );
}

export function isConfigurationSetNotFoundError(err: unknown): boolean {
  return err instanceof SesError && err.code === "not_found";
}

export function isSesAccessDeniedError(err: unknown): boolean {
  return (
    err instanceof SesError &&
    err.awsErrorType === "AccessDeniedException"
  );
}
