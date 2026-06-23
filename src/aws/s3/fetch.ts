import { createAwsClient } from "../aws-client.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import { S3Error } from "./types.js";

const S3_GLOBAL_REGION = "us-east-1";
const S3_REQUEST_TIMEOUT_MS = 15_000;

function parseS3ErrorCode(xml: string): string | undefined {
  const match = xml.match(/<Code>([^<]+)<\/Code>/);
  return match?.[1];
}

function bucketUrl(bucketName: string, query: string, region: string): string {
  if (region === "us-east-1") {
    return `https://${bucketName}.s3.amazonaws.com/?${query}`;
  }
  return `https://${bucketName}.s3.${region}.amazonaws.com/?${query}`;
}

export type S3BucketFetchResult =
  | { ok: true; body: string }
  | { ok: false; errorCode: string; statusCode: number };

export async function s3BucketFetch(
  capability: AwsCapabilityId,
  bucketName: string,
  query: string,
  signingRegion: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<S3BucketFetchResult> {
  assertAwsCapability(capability);

  const client = createAwsClient(credentials, "s3", signingRegion);
  const url = bucketUrl(bucketName, query, signingRegion);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), S3_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    const body = await response.text();

    if (!response.ok) {
      const errorCode = parseS3ErrorCode(body) ?? "S3Error";
      return { ok: false, errorCode, statusCode: response.status };
    }

    execution?.recordAwsRequest(capability, signingRegion);
    return { ok: true, body };
  } catch (err) {
    if (err instanceof AwsRequestError || err instanceof S3Error) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new S3Error("aws_request_failed", "S3 request timed out.");
    }

    throw new S3Error("aws_request_failed", "S3 request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function s3ListBucketsFetch(
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<string> {
  assertAwsCapability("s3:ListAllMyBuckets");

  const client = createAwsClient(credentials, "s3", S3_GLOBAL_REGION);

  const url = "https://s3.amazonaws.com/";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), S3_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "S3 request failed.",
        retryable: response.status >= 500,
        statusCode: response.status,
        service: "s3",
        region: S3_GLOBAL_REGION,
      });
    }

    execution?.recordAwsRequest("s3:ListAllMyBuckets", S3_GLOBAL_REGION);

    return await response.text();
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "S3 request timed out.",
        retryable: true,
        statusCode: 0,
        service: "s3",
        region: S3_GLOBAL_REGION,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "S3 request failed.",
      retryable: false,
      statusCode: 0,
      service: "s3",
      region: S3_GLOBAL_REGION,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
