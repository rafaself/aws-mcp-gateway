import type { S3Bucket } from "./types.js";
import type {
  S3EncryptionStatus,
  S3LifecycleRuleSummary,
  S3LifecycleSummary,
  S3PublicAccessBlockStatus,
  S3VersioningStatus,
} from "./types.js";
import { S3_MAX_LIFECYCLE_RULES_SUMMARY } from "../../security/limits.js";

const BUCKET_BLOCK_RE =
  /<Bucket>\s*<Name>([^<]*)<\/Name>\s*<CreationDate>([^<]*)<\/CreationDate>\s*<\/Bucket>/g;

export function parseListBucketsXml(xml: string): S3Bucket[] {
  const buckets: S3Bucket[] = [];
  let match: RegExpExecArray | null;

  BUCKET_BLOCK_RE.lastIndex = 0;
  while ((match = BUCKET_BLOCK_RE.exec(xml)) !== null) {
    buckets.push({
      name: match[1],
      createdAt: match[2],
    });
  }

  return buckets;
}

function parseXmlTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match?.[1];
}

function parseXmlBool(xml: string, tag: string): boolean {
  return parseXmlTag(xml, tag) === "true";
}

export function parseBucketLocationXml(xml: string): string {
  const match = xml.match(/<LocationConstraint[^>]*>([^<]*)<\/LocationConstraint>/);
  const constraint = match?.[1]?.trim();
  if (!constraint) {
    return "us-east-1";
  }
  if (constraint === "US" || constraint === "EU") {
    return "us-east-1";
  }
  return constraint;
}

export function parsePublicAccessBlockXml(xml: string): S3PublicAccessBlockStatus {
  return {
    blockPublicAcls: parseXmlBool(xml, "BlockPublicAcls"),
    ignorePublicAcls: parseXmlBool(xml, "IgnorePublicAcls"),
    blockPublicPolicy: parseXmlBool(xml, "BlockPublicPolicy"),
    restrictPublicBuckets: parseXmlBool(xml, "RestrictPublicBuckets"),
  };
}

export function parseBucketEncryptionXml(xml: string): S3EncryptionStatus {
  const algorithm = parseXmlTag(xml, "SSEAlgorithm");
  const kmsKeyId = parseXmlTag(xml, "KMSMasterKeyID");
  return {
    configured: Boolean(algorithm),
    ...(algorithm ? { algorithm } : {}),
    ...(kmsKeyId ? { kmsKeyId } : {}),
  };
}

export function parseBucketVersioningXml(xml: string): S3VersioningStatus {
  return {
    status: parseXmlTag(xml, "Status") ?? "Disabled",
  };
}

export function parseLifecycleConfigurationXml(xml: string): S3LifecycleSummary {
  const rules: S3LifecycleRuleSummary[] = [];
  const ruleBlocks = xml.match(/<Rule>[\s\S]*?<\/Rule>/g) ?? [];

  for (const block of ruleBlocks.slice(0, S3_MAX_LIFECYCLE_RULES_SUMMARY)) {
    rules.push({
      id: parseXmlTag(block, "ID") ?? "",
      status: parseXmlTag(block, "Status") ?? "",
    });
  }

  return {
    ruleCount: ruleBlocks.length,
    rules,
  };
}

export function parseBucketPolicyStatusXml(xml: string): boolean {
  return parseXmlBool(xml, "IsPublic");
}
