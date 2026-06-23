import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getServiceHealth } from "../../../aws/ecs/index.js";
import { ECS_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEcsServiceHealthInput } from "../../audit/tool-input.js";
import {
  ecsServiceHealthOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const ecsServiceHealthInputSchema = z.object({
  clusterName: z.string().describe("ECS cluster name."),
  serviceName: z.string().describe("ECS service name."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
});

type EcsServiceHealthInput = z.infer<typeof ecsServiceHealthInputSchema>;

export function createGetEcsServiceHealthToolManifest(
  ctx: GatewayContext,
): ToolManifest<EcsServiceHealthInput> {
  return {
    name: "get_ecs_service_health",
    title: PUBLIC_TOOL_TITLES.get_ecs_service_health,
    description:
      "Returns normalized ECS service health including deployment status, task counts, and recent service events.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: ecsServiceHealthInputSchema,
    outputSchema: ecsServiceHealthOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ecs", "service", "health", "deployment", "containers"],
      docsAnchor: "13-get_ecs_service_health",
      inputSummary: "clusterName, serviceName, optional region.",
      awsService: "ecs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ecs"],
      actions: ["ecs:DescribeClusters", "ecs:DescribeServices"],
      capabilities: ["ecs:DescribeClusters", "ecs:DescribeServices"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: ECS_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 15000,
      minCacheTtlSeconds: ECS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ecs",
      getRegion: (args: EcsServiceHealthInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEcsServiceHealthInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: EcsServiceHealthInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const health = await getServiceHealth(
        args.clusterName,
        args.serviceName,
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text =
        `ECS service ${health.serviceName} in cluster ${health.clusterName} (${region}): ` +
        `${health.runningCount}/${health.desiredCount} running, ` +
        `deployment ${health.deploymentStatus}, rollout ${health.rolloutState}.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...health },
      };
    },
  };
}
