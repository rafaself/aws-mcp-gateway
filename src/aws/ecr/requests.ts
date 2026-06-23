import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import { AwsRequestError } from "../errors.js";
import type { AwsCredentials } from "../types.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type {
  DescribeImagesResponse,
  DescribeImageScanFindingsResponse,
  GetLifecyclePolicyResponse,
} from "./types.js";
import { EcrError } from "./types.js";

const ECR_TARGET_PREFIX = "AmazonEC2ContainerRegistryV20150921";
const ECR_REQUEST_TIMEOUT_MS = 15_000;

function ecrHeaders(target: string): Record<string, string> {
  return {
    "X-Amz-Target": `${ECR_TARGET_PREFIX}.${target}`,
    "Content-Type": "application/x-amz-json-1.1",
  };
}

function parseAwsErrorType(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { __type?: string; code?: string };
    const rawType = parsed.__type ?? parsed.code;
    if (!rawType) return undefined;
    const slash = rawType.lastIndexOf("#");
    return slash >= 0 ? rawType.slice(slash + 1) : rawType;
  } catch {
    return undefined;
  }
}

async function ecrRequest<T>(
  capability: AwsCapabilityId,
  target: string,
  body: Record<string, unknown>,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);

  const client = createAwsClient(credentials, "ecr", region);
  const url = `https://ecr.${region}.amazonaws.com/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ECR_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "POST",
      headers: ecrHeaders(target),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const awsErrorType = parseAwsErrorType(text);
      throw new EcrError(
        "aws_request_failed",
        "ECR request failed.",
        awsErrorType,
      );
    }

    execution?.recordAwsRequest(capability, region);

    if (text.length === 0) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof EcrError || err instanceof AwsRequestError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new EcrError("aws_request_failed", "ECR request timed out.");
    }

    throw new EcrError("aws_request_failed", "ECR request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function describeImages(
  repositoryName: string,
  options: {
    imageTag?: string;
    imageDigest?: string;
    maxResults?: number;
  },
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeImagesResponse> {
  const body: Record<string, unknown> = {
    repositoryName,
    maxResults: options.maxResults ?? 100,
  };

  if (options.imageTag) {
    body.imageIds = [{ imageTag: options.imageTag }];
  } else if (options.imageDigest) {
    body.imageIds = [{ imageDigest: options.imageDigest }];
  }

  return ecrRequest<DescribeImagesResponse>(
    "ecr:DescribeImages",
    "DescribeImages",
    body,
    region,
    credentials,
    execution,
  );
}

export async function describeImageScanFindings(
  repositoryName: string,
  imageId: { imageDigest: string },
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<DescribeImageScanFindingsResponse> {
  return ecrRequest<DescribeImageScanFindingsResponse>(
    "ecr:DescribeImageScanFindings",
    "DescribeImageScanFindings",
    {
      repositoryName,
      imageId,
    },
    region,
    credentials,
    execution,
  );
}

export async function getLifecyclePolicy(
  repositoryName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<GetLifecyclePolicyResponse> {
  return ecrRequest<GetLifecyclePolicyResponse>(
    "ecr:GetLifecyclePolicy",
    "GetLifecyclePolicy",
    { repositoryName },
    region,
    credentials,
    execution,
  );
}

export function isRepositoryNotFoundError(err: unknown): boolean {
  return err instanceof EcrError && err.awsErrorType === "RepositoryNotFoundException";
}

export function isImageNotFoundError(err: unknown): boolean {
  return err instanceof EcrError && err.awsErrorType === "ImageNotFoundException";
}

export function isLifecyclePolicyNotFoundError(err: unknown): boolean {
  return err instanceof EcrError && err.awsErrorType === "LifecyclePolicyNotFoundException";
}

export function isScanNotFoundError(err: unknown): boolean {
  return (
    err instanceof EcrError &&
    (err.awsErrorType === "ScanNotFoundException" ||
      err.awsErrorType === "UnsupportedImageTypeException")
  );
}
