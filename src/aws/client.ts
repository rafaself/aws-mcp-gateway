import { AwsClient } from "aws4fetch";
import { AwsRequestError } from "./errors.js";
import type { AwsRequestOptions, AwsCredentials } from "./types.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export async function awsRequest<T = Record<string, unknown>>(
  options: AwsRequestOptions,
  credentials: AwsCredentials,
): Promise<T> {
  const { service, region, method, path, query, headers, body } = options;

  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service,
    region,
  });

  const url = new URL(`https://${service}.${region}.amazonaws.com${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const init: RequestInit & { aws?: Record<string, unknown> } = {
    method,
    headers: {
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await client.fetch(url.toString(), {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "AWS request failed.",
        retryable: response.status >= 500,
        statusCode: response.status,
        service,
        region,
      });
    }

    const text = await response.text();

    if (text.length === 0) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "AWS request failed.",
        retryable: true,
        statusCode: 0,
        service,
        region,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "AWS request failed.",
      retryable: false,
      statusCode: 0,
      service,
      region,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
