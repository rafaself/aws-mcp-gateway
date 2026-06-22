import { AwsClient } from "aws4fetch";
import { assertAwsCapability } from "../capabilities.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";

const S3_GLOBAL_REGION = "us-east-1";
const S3_REQUEST_TIMEOUT_MS = 15_000;

export async function s3ListBucketsFetch(
  credentials: AwsCredentials,
): Promise<string> {
  assertAwsCapability("s3:ListAllMyBuckets");

  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "s3",
    region: S3_GLOBAL_REGION,
  });

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
