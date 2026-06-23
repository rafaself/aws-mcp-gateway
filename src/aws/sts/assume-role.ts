import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability } from "../capabilities.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import { parseAssumeRoleResponse } from "./parse.js";
import { buildRoleSessionName } from "./session-name.js";

const STS_API_VERSION = "2011-06-15";
const STS_REQUEST_TIMEOUT_MS = 15_000;

export type AssumeRoleOptions = {
  roleArn: string;
  region: string;
  externalId?: string;
  sessionName?: string;
};

export async function assumeRole(
  options: AssumeRoleOptions,
  credentials: AwsCredentials,
): Promise<AwsCredentials> {
  assertAwsCapability("sts:AssumeRole");

  const { roleArn, region, externalId, sessionName } = options;
  const roleSessionName = buildRoleSessionName(roleArn, sessionName);

  const client = createAwsClient(credentials, "sts", region);
  const url = `https://sts.${region}.amazonaws.com/`;

  const bodyParams = new URLSearchParams({
    Action: "AssumeRole",
    Version: STS_API_VERSION,
    RoleArn: roleArn,
    RoleSessionName: roleSessionName,
  });

  if (externalId) {
    bodyParams.set("ExternalId", externalId);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STS_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: bodyParams.toString(),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "STS AssumeRole failed.",
        retryable: response.status >= 500,
        statusCode: response.status,
        service: "sts",
        region,
      });
    }

    const assumed = parseAssumeRoleResponse(text);

    return {
      accessKeyId: assumed.accessKeyId,
      secretAccessKey: assumed.secretAccessKey,
      sessionToken: assumed.sessionToken,
      expiresAt: Date.parse(assumed.expiration),
      source: "assume-role",
    };
  } catch (err) {
    if (err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new AwsRequestError({
        code: "aws_request_failed",
        message: "STS AssumeRole failed.",
        retryable: true,
        statusCode: 0,
        service: "sts",
        region,
      });
    }

    throw new AwsRequestError({
      code: "aws_request_failed",
      message: "STS AssumeRole failed.",
      retryable: false,
      statusCode: 0,
      service: "sts",
      region,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
