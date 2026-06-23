import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { compareServiceImageWithEcr } from "../../../aws/ecs/index.js";
import { ECS_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEcsEcrImageCompareInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  compareEcsTaskImageWithEcrOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const compareEcsTaskImageWithEcrInputSchema = z.object({
  clusterName: z.string().describe("ECS cluster name."),
  serviceName: z.string().describe("ECS service name."),
  repositoryName: z.string().describe("ECR repository name to compare against."),
  expectedImageDigest: z
    .string()
    .optional()
    .describe("Optional sha256 digest the service should be running."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
});

type CompareEcsTaskImageWithEcrInput = z.infer<typeof compareEcsTaskImageWithEcrInputSchema>;

export function createCompareEcsTaskImageWithEcrToolManifest(
  ctx: GatewayContext,
): ToolManifest<CompareEcsTaskImageWithEcrInput> {
  return {
    name: "compare_ecs_task_image_with_ecr",
    title: PUBLIC_TOOL_TITLES.compare_ecs_task_image_with_ecr,
    description:
      "Compares an ECS service task definition and running task image digests against ECR. " +
      "Supports immutable digest-based deployment verification.",
    pack: "inventory",
    lifecycle: "stable",
    inputSchema: compareEcsTaskImageWithEcrInputSchema,
    outputSchema: compareEcsTaskImageWithEcrOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ecs", "ecr", "deployment", "image", "digest", "container"],
      docsAnchor: "22-compare_ecs_task_image_with_ecr",
      inputSummary:
        "clusterName, serviceName, repositoryName, optional expectedImageDigest, optional region.",
      awsService: "ecs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ecs", "ecr"],
      actions: [
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "ecr:DescribeImages",
        "ecr:DescribeImageScanFindings",
        "ecr:GetLifecyclePolicy",
      ],
      capabilities: [
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:ListTasks",
        "ecs:DescribeTasks",
        "ecr:DescribeImages",
        "ecr:DescribeImageScanFindings",
        "ecr:GetLifecyclePolicy",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: ECS_CACHE_TTL_SECONDS,
      timeoutMs: 20000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 20000,
      minCacheTtlSeconds: ECS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ecs",
      getRegion: (args: CompareEcsTaskImageWithEcrInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEcsEcrImageCompareInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CompareEcsTaskImageWithEcrInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const comparison = await compareServiceImageWithEcr(
        args.clusterName,
        args.serviceName,
        args.repositoryName,
        {
          expectedImageDigest: args.expectedImageDigest,
          region,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text =
        `ECS/ECR comparison for ${args.serviceName} in ${args.clusterName} (${region}): ` +
        `matches ECR digest=${comparison.matchesEcrDigest}, ` +
        `expected digest match=${comparison.matchesExpectedDigest ?? "n/a"}.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...comparison },
      };
    },
  };
}
