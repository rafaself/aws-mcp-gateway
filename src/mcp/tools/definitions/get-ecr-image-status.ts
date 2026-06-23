import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getImageStatus } from "../../../aws/ecr/index.js";
import { ECR_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEcrImageStatusInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getEcrImageStatusOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getEcrImageStatusInputSchema = z.object({
  repositoryName: z
    .string()
    .describe("ECR repository name (no application profile required)."),
  imageTag: z
    .string()
    .optional()
    .describe("Optional image tag to inspect."),
  imageDigest: z
    .string()
    .optional()
    .describe("Optional sha256 image digest to inspect."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
});

type GetEcrImageStatusInput = z.infer<typeof getEcrImageStatusInputSchema>;

export function createGetEcrImageStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetEcrImageStatusInput> {
  return {
    name: "get_ecr_image_status",
    title: PUBLIC_TOOL_TITLES.get_ecr_image_status,
    description:
      "Returns normalized ECR image metadata including digest, tags, push time, scan status, " +
      "and lifecycle policy presence. Does not pull images or expose unrelated repository data.",
    pack: "inventory",
    lifecycle: "stable",
    inputSchema: getEcrImageStatusInputSchema,
    outputSchema: getEcrImageStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ecr", "container", "image", "digest", "scan", "deployment"],
      docsAnchor: "21-get_ecr_image_status",
      inputSummary: "repositoryName, optional imageTag or imageDigest, optional region.",
      awsService: "ecr",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ecr"],
      actions: [
        "ecr:DescribeImages",
        "ecr:DescribeImageScanFindings",
        "ecr:GetLifecyclePolicy",
      ],
      capabilities: [
        "ecr:DescribeImages",
        "ecr:DescribeImageScanFindings",
        "ecr:GetLifecyclePolicy",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: ECR_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 15000,
      minCacheTtlSeconds: ECR_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ecr",
      getRegion: (args: GetEcrImageStatusInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEcrImageStatusInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetEcrImageStatusInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const status = await getImageStatus(
        args.repositoryName,
        {
          imageTag: args.imageTag,
          imageDigest: args.imageDigest,
          region,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text = status.found
        ? `ECR image ${args.repositoryName} (${region}): digest ${status.imageDigest ?? "unknown"}.`
        : `ECR repository ${args.repositoryName} (${region}): image not found.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...status },
      };
    },
  };
}
