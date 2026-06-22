import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { describeLogGroups } from "../../../aws/logs/index.js";
import {
  LOG_GROUPS_MAX_COUNT,
  LOG_GROUP_PREFIX_MAX_LENGTH,
  LOGS_CACHE_TTL_SECONDS,
} from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeLogGroupsInput } from "../../audit/tool-input.js";
import {
  listLogGroupsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { manifestToGatewayDefinitionForContext, type GatewayToolDefinition } from "../registry.js";

const listLogGroupsInputSchema = z.object({
  region: z.string().describe("AWS region (must be in the allowed regions list)."),
  prefix: z
    .string()
    .max(LOG_GROUP_PREFIX_MAX_LENGTH)
    .optional()
    .describe(`Optional log group name prefix (max ${LOG_GROUP_PREFIX_MAX_LENGTH} characters).`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LOG_GROUPS_MAX_COUNT)
    .optional()
    .describe(`Maximum number of log groups to return (1–${LOG_GROUPS_MAX_COUNT}).`),
});

type ListLogGroupsInput = z.infer<typeof listLogGroupsInputSchema>;

export function createListLogGroupsToolManifest(
  ctx: GatewayContext,
): ToolManifest<ListLogGroupsInput> {
  return {
    name: "list_log_groups",
    title: PUBLIC_TOOL_TITLES.list_log_groups,
    description: "Lists CloudWatch log groups in a region with optional prefix filtering.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: listLogGroupsInputSchema,
    outputSchema: listLogGroupsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["logs", "cloudwatch logs", "log groups", "observability"],
      docsAnchor: "9-list_log_groups",
      inputSummary: "region, optional prefix and limit.",
      awsService: "logs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["logs"],
      actions: ["logs:DescribeLogGroups"],
      capabilities: ["logs:DescribeLogGroups"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: LOGS_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "volume-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxResultCount: LOG_GROUPS_MAX_COUNT,
      minCacheTtlSeconds: LOGS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "logs",
      getRegion: (args: ListLogGroupsInput) => args.region,
      sanitizeInput: (args) => summarizeLogGroupsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ListLogGroupsInput) => {
      validateRegion(args.region, ctx.allowedRegions);

      const logGroups = await describeLogGroups(
        { prefix: args.prefix, limit: args.limit },
        args.region,
        ctx.credentials,
        ctx.cache,
      );

      const count = logGroups.length;
      const groupEntries = logGroups.map((g) => ({ name: g.name }));

      const text = `Found ${count} log group(s) in ${args.region}.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          region: args.region,
          count,
          logGroups: groupEntries,
        },
      };
    },
  };
}

export function createListLogGroupsToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(
    ctx,
    createListLogGroupsToolManifest(ctx) as AnyToolManifest,
  );
}
