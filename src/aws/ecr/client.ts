import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { ECR_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import {
  buildNotFoundImageStatus,
  normalizeImageDetail,
  pickImageFromResponse,
} from "./parse.js";
import {
  describeImageScanFindings,
  describeImages,
  getLifecyclePolicy,
  isImageNotFoundError,
  isLifecyclePolicyNotFoundError,
  isRepositoryNotFoundError,
  isScanNotFoundError,
} from "./requests.js";
import type { EcrImageStatusResult } from "./types.js";
import {
  validateImageSelector,
  validateRepositoryName,
} from "./validation.js";

export interface GetImageStatusOptions {
  imageTag?: string;
  imageDigest?: string;
  region: string;
}

async function enrichScanFindings(
  status: EcrImageStatusResult,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<EcrImageStatusResult> {
  if (!status.found || !status.imageDigest) {
    return status;
  }

  if (status.scanStatus !== "COMPLETE" && status.scanStatus !== "FAILED") {
    return status;
  }

  try {
    const findings = await describeImageScanFindings(
      status.repositoryName,
      { imageDigest: status.imageDigest },
      status.region,
      credentials,
      execution,
    );
    const counts = findings.imageScanFindings?.findingSeverityCounts;
    if (!counts) {
      return status;
    }
    return {
      ...status,
      scanSummary: {
        criticalCount: counts.CRITICAL ?? 0,
        highCount: counts.HIGH ?? 0,
      },
    };
  } catch (err) {
    if (isScanNotFoundError(err)) {
      return status;
    }
    throw err;
  }
}

async function enrichLifecyclePolicy(
  status: EcrImageStatusResult,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<EcrImageStatusResult> {
  if (!status.found) {
    return status;
  }

  try {
    const policy = await getLifecyclePolicy(
      status.repositoryName,
      status.region,
      credentials,
      execution,
    );
    return {
      ...status,
      hasLifecyclePolicy: Boolean(policy.lifecyclePolicyText),
    };
  } catch (err) {
    if (isLifecyclePolicyNotFoundError(err)) {
      return { ...status, hasLifecyclePolicy: false };
    }
    if (isRepositoryNotFoundError(err)) {
      return status;
    }
    throw err;
  }
}

export async function getImageStatus(
  repositoryName: string,
  options: GetImageStatusOptions,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<EcrImageStatusResult> {
  validateRepositoryName(repositoryName);
  validateImageSelector(options.imageTag, options.imageDigest);

  const cacheKey = await buildCacheKey("get_ecr_image_status", {
    repositoryName,
    region: options.region,
    imageTag: options.imageTag,
    imageDigest: options.imageDigest,
  });
  const { value: cached } = await cacheReadWithStatus<EcrImageStatusResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  let status: EcrImageStatusResult;

  try {
    const response = await describeImages(
      repositoryName,
      {
        imageTag: options.imageTag,
        imageDigest: options.imageDigest,
      },
      options.region,
      credentials,
      execution,
    );

    if (options.imageTag || options.imageDigest) {
      const image = response.imageDetails?.[0];
      status = image
        ? normalizeImageDetail(options.region, repositoryName, image)
        : buildNotFoundImageStatus(options.region, repositoryName);
    } else {
      status = pickImageFromResponse(response, options.region, repositoryName);
    }
  } catch (err) {
    if (isRepositoryNotFoundError(err) || isImageNotFoundError(err)) {
      status = buildNotFoundImageStatus(options.region, repositoryName);
    } else {
      throw err;
    }
  }

  if (status.found) {
    status = await enrichScanFindings(status, credentials, execution);
    status = await enrichLifecyclePolicy(status, credentials, execution);
  }

  if (cache) {
    await cacheSet(cache, cacheKey, status, ECR_CACHE_TTL_SECONDS);
  }

  return status;
}
