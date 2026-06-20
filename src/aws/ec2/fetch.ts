import { AwsClient } from "aws4fetch";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import { parseEc2Response } from "./xml.js";

const EC2_API_VERSION = "2016-11-15";
const EC2_REQUEST_TIMEOUT_MS = 30_000;

export async function ec2Fetch<T>(
  action: string,
  params: Record<string, string>,
  region: string,
  credentials: AwsCredentials,
): Promise<T> {
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: "ec2",
    region,
  });

  const url = new URL(`https://ec2.${region}.amazonaws.com/`);

  const bodyParams = new URLSearchParams({
    Action: action,
    Version: EC2_API_VERSION,
    ...params,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EC2_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: bodyParams.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `EC2 request failed in ${region}.`,
        retryable: response.status >= 500,
        statusCode: response.status,
        service: "ec2",
        region,
      });
    }

    const text = await response.text();

    if (text.length === 0) {
      return {} as T;
    }

    return parseEc2Response(text) as T;
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: `EC2 request timed out in ${region}.`,
        retryable: true,
        statusCode: 0,
        service: "ec2",
        region,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: `EC2 request failed in ${region}.`,
      retryable: false,
      statusCode: 0,
      service: "ec2",
      region,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
