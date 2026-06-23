import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getRecentStoppedEcsTasks } from "../../../aws/ecs/index.js";
import {
  ECS_CACHE_TTL_SECONDS,
  ECS_MAX_LOOKBACK_MINUTES,
  ECS_MAX_TASKS,
} from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEcsStoppedTasksInput } from "../../audit/tool-input.js";
import {
  recentStoppedEcsTasksOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const recentStoppedEcsTasksInputSchema = z.object({
  clusterName: z.string().describe("ECS cluster name."),
  serviceName: z
    .string()
    .optional()
    .describe("Optional ECS service name to filter tasks."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
  lookbackMinutes: z
    .number()
    .int()
    .min(1)
    .max(ECS_MAX_LOOKBACK_MINUTES)
    .optional()
    .describe(`Minutes to look back for stopped tasks (1–${ECS_MAX_LOOKBACK_MINUTES}, default 60).`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ECS_MAX_TASKS)
    .optional()
    .describe(`Maximum number of stopped tasks to return (1–${ECS_MAX_TASKS}).`),
});

type RecentStoppedEcsTasksInput = z.infer<typeof recentStoppedEcsTasksInputSchema>;

export function createGetRecentStoppedEcsTasksToolManifest(
  ctx: GatewayContext,
): ToolManifest<RecentStoppedEcsTasksInput> {
  return {
    name: "get_recent_stopped_ecs_tasks",
    title: PUBLIC_TOOL_TITLES.get_recent_stopped_ecs_tasks,
    description:
      "Returns recent stopped ECS task diagnostics including stop reasons and container exit codes.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: recentStoppedEcsTasksInputSchema,
    outputSchema: recentStoppedEcsTasksOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ecs", "tasks", "stopped", "errors", "diagnostics"],
      docsAnchor: "15-get_recent_stopped_ecs_tasks",
      inputSummary: "clusterName, optional serviceName, region, lookbackMinutes, limit.",
      awsService: "ecs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ecs"],
      actions: ["ecs:ListTasks", "ecs:DescribeTasks"],
      capabilities: ["ecs:ListTasks", "ecs:DescribeTasks"],
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
      class: "volume-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxResultCount: ECS_MAX_TASKS,
      minCacheTtlSeconds: ECS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ecs",
      getRegion: (args: RecentStoppedEcsTasksInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEcsStoppedTasksInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: RecentStoppedEcsTasksInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const tasks = await getRecentStoppedEcsTasks(
        args.clusterName,
        {
          serviceName: args.serviceName,
          lookbackMinutes: args.lookbackMinutes,
          limit: args.limit,
        },
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const lookback = args.lookbackMinutes ?? 60;
      const text =
        `Found ${tasks.length} recently stopped ECS task(s) in cluster ${args.clusterName} ` +
        `(${region}, last ${lookback}m).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          region,
          clusterName: args.clusterName,
          lookbackMinutes: lookback,
          count: tasks.length,
          tasks,
        },
      };
    },
  };
}
