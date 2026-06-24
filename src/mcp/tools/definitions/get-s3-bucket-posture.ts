import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getBucketPosture } from "../../../aws/s3/index.js";
import { S3_BUCKET_POSTURE_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeS3BucketPostureInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getS3BucketPostureOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getS3BucketPostureInputSchema = z.object({
  bucketName: z
    .string()
    .describe("S3 bucket name (no application profile required)."),
  region: z
    .string()
    .optional()
    .describe("AWS region hint for signing (defaults to gateway AWS_REGION)."),
});

type GetS3BucketPostureInput = z.infer<typeof getS3BucketPostureInputSchema>;

export function createGetS3BucketPostureToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetS3BucketPostureInput> {
  return {
    name: "get_s3_bucket_posture",
    title: PUBLIC_TOOL_TITLES.get_s3_bucket_posture,
    description:
      "Returns S3 bucket security posture metadata including public access block, encryption, " +
      "versioning, lifecycle summary, and optional CloudWatch size metrics. " +
      "Does not read or list objects.",
    pack: "security",
    lifecycle: "stable",
    inputSchema: getS3BucketPostureInputSchema,
    outputSchema: getS3BucketPostureOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["s3", "bucket", "security", "encryption", "public", "posture"],
      docsAnchor: "23-get_s3_bucket_posture",
      inputSummary: "bucketName, optional region.",
      awsService: "s3",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["s3", "cloudwatch"],
      actions: [
        "s3:GetBucketLocation",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetEncryptionConfiguration",
        "s3:GetBucketVersioning",
        "s3:GetLifecycleConfiguration",
        "s3:GetBucketPolicyStatus",
        "cloudwatch:GetMetricData",
      ],
      capabilities: [
        "s3:GetBucketLocation",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketEncryption",
        "s3:GetBucketVersioning",
        "s3:GetLifecycleConfiguration",
        "s3:GetBucketPolicyStatus",
        "cloudwatch:GetMetricData",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: S3_BUCKET_POSTURE_CACHE_TTL_SECONDS,
      timeoutMs: 20000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 20000,
      minCacheTtlSeconds: S3_BUCKET_POSTURE_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "s3",
      getRegion: (args: GetS3BucketPostureInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeS3BucketPostureInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetS3BucketPostureInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const posture = await getBucketPosture(
        args.bucketName,
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text = posture.bucketExists
        ? `S3 bucket ${args.bucketName} (${posture.region}): posture metadata collected.`
        : `S3 bucket ${args.bucketName}: not found.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...posture },
      };
    },
  };
}
