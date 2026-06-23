import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface EcrImageScanSummary {
  criticalCount: number;
  highCount: number;
}

export interface EcrImageStatusResult {
  region: string;
  repositoryName: string;
  found: boolean;
  imageDigest?: string;
  tags?: string[];
  pushedAt?: string;
  imageSizeInBytes?: number;
  scanStatus?: string;
  scanSummary?: EcrImageScanSummary;
  hasLifecyclePolicy?: boolean;
}

export interface DescribeImagesResponse {
  imageDetails?: Array<{
    imageDigest?: string;
    imageTags?: string[];
    imagePushedAt?: number;
    imageSizeInBytes?: number;
    imageScanStatus?: { status?: string };
    imageScanFindingSummary?: {
      CRITICAL?: number;
      HIGH?: number;
    };
  }>;
  nextToken?: string;
}

export interface DescribeImageScanFindingsResponse {
  imageScanFindings?: {
    findingSeverityCounts?: {
      CRITICAL?: number;
      HIGH?: number;
    };
  };
}

export interface GetLifecyclePolicyResponse {
  lifecyclePolicyText?: string;
}

export class EcrError extends ValidationError {
  readonly awsErrorType?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorType?: string) {
    super(code, message);
    this.name = "EcrError";
    this.awsErrorType = awsErrorType;
  }
}
