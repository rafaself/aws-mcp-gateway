import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { LOG_GROUPS_MAX_COUNT, OVERVIEW_SAMPLE_LIMIT } from "../../../security/limits.js";
import { summarizeObservabilityOverviewInput } from "../../audit/tool-input.js";
import {
  buildObservabilityOverview,
  formatObservabilityOverviewText,
  type ObservabilityOverviewInclude,
} from "../composition/observability-overview.js";
import {
  awsObservabilityOverviewOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const OBS_INCLUDE_OPTIONS = ["alarms", "logGroups"] as const;

const awsObservabilityOverviewInputSchema = z.object({
  regions: z
    .array(z.string())
    .optional()
    .describe("AWS regions to query (defaults to all allowed regions)."),
  include: z
    .array(z.enum(OBS_INCLUDE_OPTIONS))
    .default(["alarms"])
    .describe("Observability sections to include (defaults to alarms only)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LOG_GROUPS_MAX_COUNT)
    .optional()
    .describe(`Maximum sample rows per section (1–${LOG_GROUPS_MAX_COUNT}).`),
});

type AwsObservabilityOverviewInput = z.infer<typeof awsObservabilityOverviewInputSchema>;

export function createAwsObservabilityOverviewToolManifest(
  ctx: GatewayContext,
): ToolManifest<AwsObservabilityOverviewInput> {
  return {
    name: "aws_observability_overview",
    title: PUBLIC_TOOL_TITLES.aws_observability_overview,
    description:
      "Returns a bounded observability overview by composing CloudWatch alarms and log group inventory.",
    pack: "aggregates",
    lifecycle: "stable",
    inputSchema: awsObservabilityOverviewInputSchema,
    outputSchema: awsObservabilityOverviewOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["observability", "overview", "alarms", "logs", "cloudwatch", "monitoring"],
      docsAnchor: "12-aws_observability_overview",
      inputSummary: "Optional regions[], include alarms or logGroups (default alarms), optional limit.",
      awsService: "cloudwatch",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["cloudwatch", "logs"],
      actions: ["cloudwatch:DescribeAlarms", "logs:DescribeLogGroups"],
      capabilities: ["cloudwatch:DescribeAlarms", "logs:DescribeLogGroups"],
      regionMode: "bounded-multi-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 300,
      timeoutMs: 30000,
      costClass: "cached-read",
    },
    costControl: {
      class: "fanout-sensitive",
      requiresCache: true,
      timeoutMs: 30000,
      maxRegions: ctx.allowedRegions.length,
      maxResultCount: LOG_GROUPS_MAX_COUNT,
      minCacheTtlSeconds: 300,
    },
    audit: {
      awsService: "monitoring",
      sanitizeInput: (args) => summarizeObservabilityOverviewInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: AwsObservabilityOverviewInput) => {
      const include = (args.include ?? ["alarms"]) as ObservabilityOverviewInclude[];
      const sampleLimit = args.limit ?? OVERVIEW_SAMPLE_LIMIT;
      const result = await buildObservabilityOverview(ctx, args, include, sampleLimit);

      return {
        content: [{ type: "text" as const, text: formatObservabilityOverviewText(result) }],
        structuredContent: result,
      };
    },
  };
}
