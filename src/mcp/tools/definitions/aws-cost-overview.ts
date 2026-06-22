import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import {
  COST_MAX_DATE_RANGE_DAYS,
  COST_MAX_SERVICE_ROWS,
  OVERVIEW_DEFAULT_SERVICE_LIMIT,
} from "../../../security/limits.js";
import { summarizeCostOverviewInput } from "../../audit/tool-input.js";
import { buildCostOverview, formatCostOverviewText } from "../composition/cost-overview.js";
import {
  awsCostOverviewOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { manifestToGatewayDefinitionForContext, type GatewayToolDefinition } from "../registry.js";

const awsCostOverviewInputSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be in YYYY-MM-DD format.")
    .describe("Start date in YYYY-MM-DD format."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be in YYYY-MM-DD format.")
    .describe("End date in YYYY-MM-DD format."),
  granularity: z
    .enum(["DAILY", "MONTHLY"])
    .default("MONTHLY")
    .describe("Time granularity for the cost data."),
  serviceLimit: z
    .number()
    .int()
    .min(1)
    .max(COST_MAX_SERVICE_ROWS)
    .default(OVERVIEW_DEFAULT_SERVICE_LIMIT)
    .describe(`Maximum number of services to return (max ${COST_MAX_SERVICE_ROWS}).`),
});

type AwsCostOverviewInput = z.infer<typeof awsCostOverviewInputSchema>;

export function createAwsCostOverviewToolManifest(
  ctx: GatewayContext,
): ToolManifest<AwsCostOverviewInput> {
  return {
    name: "aws_cost_overview",
    title: PUBLIC_TOOL_TITLES.aws_cost_overview,
    description:
      "Returns a bounded cost overview by composing cost summary and cost-by-service capabilities.",
    pack: "aggregates",
    lifecycle: "stable",
    inputSchema: awsCostOverviewInputSchema,
    outputSchema: awsCostOverviewOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cost", "overview", "billing", "spend", "services", "summary"],
      docsAnchor: "11-aws_cost_overview",
      inputSummary: "startDate, endDate, optional granularity and serviceLimit (max 25).",
      awsService: "ce",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ce"],
      actions: ["ce:GetCostAndUsage"],
      capabilities: ["ce:GetCostAndUsage"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 1800,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "paid",
      requiresCache: true,
      timeoutMs: 15000,
      maxDateRangeDays: COST_MAX_DATE_RANGE_DAYS,
      maxResultCount: COST_MAX_SERVICE_ROWS,
      minCacheTtlSeconds: 1800,
    },
    audit: {
      awsService: "ce",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeCostOverviewInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: AwsCostOverviewInput) => {
      const result = await buildCostOverview(ctx, args, args.serviceLimit);

      return {
        content: [{ type: "text" as const, text: formatCostOverviewText(result) }],
        structuredContent: result,
      };
    },
  };
}

export function createAwsCostOverviewToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(
    ctx,
    createAwsCostOverviewToolManifest(ctx) as AnyToolManifest,
  );
}
