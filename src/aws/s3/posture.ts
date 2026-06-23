import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { S3_BUCKET_POSTURE_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { getS3BucketMetrics } from "../cloudwatch/metrics.js";
import type { AwsCredentials } from "../types.js";
import { s3BucketFetch } from "./fetch.js";
import {
  parseBucketEncryptionXml,
  parseBucketLocationXml,
  parseBucketPolicyStatusXml,
  parseBucketVersioningXml,
  parseLifecycleConfigurationXml,
  parsePublicAccessBlockXml,
} from "./parse.js";
import type { S3BucketPostureResult } from "./types.js";
import { S3Error } from "./types.js";
import { validateBucketName } from "./validation.js";

const OPTIONAL_NOT_FOUND_CODES = new Set([
  "NoSuchPublicAccessBlockConfiguration",
  "ServerSideEncryptionConfigurationNotFoundError",
  "NoSuchLifecycleConfiguration",
]);

async function fetchOptionalBucketConfig(
  capability:
    | "s3:GetBucketPublicAccessBlock"
    | "s3:GetBucketEncryption"
    | "s3:GetBucketVersioning"
    | "s3:GetLifecycleConfiguration"
    | "s3:GetBucketPolicyStatus",
  bucketName: string,
  query: string,
  signingRegion: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<string | undefined> {
  const result = await s3BucketFetch(
    capability,
    bucketName,
    query,
    signingRegion,
    credentials,
    execution,
  );

  if (result.ok) {
    return result.body;
  }

  if (OPTIONAL_NOT_FOUND_CODES.has(result.errorCode) || result.statusCode === 404) {
    return undefined;
  }

  return undefined;
}

export async function getBucketPosture(
  bucketName: string,
  regionHint: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<S3BucketPostureResult> {
  validateBucketName(bucketName);

  const cacheKey = await buildCacheKey("get_s3_bucket_posture", {
    bucketName,
    region: regionHint,
  });
  const { value: cached } = await cacheReadWithStatus<S3BucketPostureResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  const locationResult = await s3BucketFetch(
    "s3:GetBucketLocation",
    bucketName,
    "location",
    regionHint,
    credentials,
    execution,
  );

  if (!locationResult.ok) {
    if (locationResult.errorCode === "NoSuchBucket" || locationResult.statusCode === 404) {
      const missing: S3BucketPostureResult = {
        bucketName,
        region: regionHint,
        bucketExists: false,
        tlsOnlyPolicyIndicator: "unknown",
      };
      if (cache) {
        await cacheSet(cache, cacheKey, missing, S3_BUCKET_POSTURE_CACHE_TTL_SECONDS);
      }
      return missing;
    }
  }

  if (!locationResult.ok) {
    throw new S3Error("aws_request_failed", "S3 bucket location request failed.");
  }

  const bucketRegion = parseBucketLocationXml(locationResult.body);

  const [
    publicAccessXml,
    encryptionXml,
    versioningXml,
    lifecycleXml,
    policyStatusXml,
  ] = await Promise.all([
    fetchOptionalBucketConfig(
      "s3:GetBucketPublicAccessBlock",
      bucketName,
      "publicAccessBlock",
      bucketRegion,
      credentials,
      execution,
    ),
    fetchOptionalBucketConfig(
      "s3:GetBucketEncryption",
      bucketName,
      "encryption",
      bucketRegion,
      credentials,
      execution,
    ),
    fetchOptionalBucketConfig(
      "s3:GetBucketVersioning",
      bucketName,
      "versioning",
      bucketRegion,
      credentials,
      execution,
    ),
    fetchOptionalBucketConfig(
      "s3:GetLifecycleConfiguration",
      bucketName,
      "lifecycle",
      bucketRegion,
      credentials,
      execution,
    ),
    fetchOptionalBucketConfig(
      "s3:GetBucketPolicyStatus",
      bucketName,
      "policyStatus",
      bucketRegion,
      credentials,
      execution,
    ),
  ]);

  let metrics: S3BucketPostureResult["metrics"];
  try {
    metrics = await getS3BucketMetrics(bucketName, bucketRegion, credentials, execution);
  } catch {
    metrics = undefined;
  }

  const posture: S3BucketPostureResult = {
    bucketName,
    region: bucketRegion,
    bucketExists: true,
    tlsOnlyPolicyIndicator: "unknown",
    ...(publicAccessXml
      ? { publicAccessBlock: parsePublicAccessBlockXml(publicAccessXml) }
      : {}),
    ...(encryptionXml
      ? { encryption: parseBucketEncryptionXml(encryptionXml) }
      : { encryption: { configured: false } }),
    ...(versioningXml ? { versioning: parseBucketVersioningXml(versioningXml) } : {}),
    ...(lifecycleXml ? { lifecycle: parseLifecycleConfigurationXml(lifecycleXml) } : {}),
    ...(policyStatusXml !== undefined
      ? { isPublic: parseBucketPolicyStatusXml(policyStatusXml) }
      : {}),
    ...(metrics ? { metrics } : {}),
  };

  if (cache) {
    await cacheSet(cache, cacheKey, posture, S3_BUCKET_POSTURE_CACHE_TTL_SECONDS);
  }

  return posture;
}
