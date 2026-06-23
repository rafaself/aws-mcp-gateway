import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listEcsTasks } from "../../../aws/ecs/index.js";
import { ECS_CACHE_TTL_SECONDS, ECS_MAX_TASKS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEcsTasksInput } from "../../audit/tool-input.js";
import {
  listEcsTasksOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const listEcsTasksInputSchema = z.object({
  clusterName: z.string().describe("ECS cluster name."),
  serviceName: z
    .string()
    .optional()
    .describe("Optional ECS service name to filter tasks."),
  desiredStatus: z
    .enum(["RUNNING", "PENDING", "STOPPED"])
    .optional()
    .describe("Optional desired status filter."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(ECS_MAX_TASKS)
    .optional()
    .describe(`Maximum number of tasks to return (1–${ECS_MAX_TASKS}).`),
});

type ListEcsTasksInput = z.infer<typeof listEcsTasksInputSchema>;

export function createListEcsTasksToolManifest(
  ctx: GatewayContext,
): ToolManifest<ListEcsTasksInput> {
  return {
    name: "list_ecs_tasks",
    title: PUBLIC_TOOL_TITLES.list_ecs_tasks,
    description:
      "Lists ECS tasks in a cluster with optional service and status filters and bounded result limits.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: listEcsTasksInputSchema,
    outputSchema: listEcsTasksOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ecs", "tasks", "containers", "cluster"],
      docsAnchor: "14-list_ecs_tasks",
      inputSummary: "clusterName, optional serviceName, desiredStatus, region, limit.",
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
      getRegion: (args: ListEcsTasksInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEcsTasksInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ListEcsTasksInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const tasks = await listEcsTasks(
        args.clusterName,
        {
          serviceName: args.serviceName,
          desiredStatus: args.desiredStatus,
          limit: args.limit,
        },
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text = `Found ${tasks.length} ECS task(s) in cluster ${args.clusterName} (${region}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          region,
          clusterName: args.clusterName,
          count: tasks.length,
          tasks,
        },
      };
    },
  };
}
