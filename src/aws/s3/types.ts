import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface S3ListBucketsOptions {
  limit?: number;
}

export interface S3Bucket {
  name: string;
  createdAt: string;
}

export interface S3PublicAccessBlockStatus {
  blockPublicAcls: boolean;
  ignorePublicAcls: boolean;
  blockPublicPolicy: boolean;
  restrictPublicBuckets: boolean;
}

export interface S3EncryptionStatus {
  configured: boolean;
  algorithm?: string;
  kmsKeyId?: string;
}

export interface S3VersioningStatus {
  status: string;
}

export interface S3LifecycleRuleSummary {
  id: string;
  status: string;
}

export interface S3LifecycleSummary {
  ruleCount: number;
  rules: S3LifecycleRuleSummary[];
}

export interface S3BucketMetrics {
  bucketSizeBytes?: number;
  objectCount?: number;
  asOf?: string;
}

export interface S3BucketPostureResult {
  bucketName: string;
  region: string;
  bucketExists: boolean;
  publicAccessBlock?: S3PublicAccessBlockStatus;
  encryption?: S3EncryptionStatus;
  versioning?: S3VersioningStatus;
  lifecycle?: S3LifecycleSummary;
  isPublic?: boolean;
  tlsOnlyPolicyIndicator: "unknown";
  metrics?: S3BucketMetrics;
}

export class S3Error extends ValidationError {
  readonly awsErrorCode?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorCode?: string) {
    super(code, message);
    this.name = "S3Error";
    this.awsErrorCode = awsErrorCode;
  }
}
