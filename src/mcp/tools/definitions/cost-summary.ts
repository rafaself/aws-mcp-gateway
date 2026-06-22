import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getCostSummary } from "../../../aws/cost-explorer/index.js";
import { summarizeCostDateRangeInput } from "../../audit/tool-input.js";
import {
  costSummaryOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  manifestToGatewayDefinition,
  type ToolManifest,
} from "../manifest.js";
import type { GatewayToolDefinition } from "../registry.js";

const costSummaryInputSchema = z.object({
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
});

type CostSummaryInput = z.infer<typeof costSummaryInputSchema>;

export function createCostSummaryToolManifest(ctx: GatewayContext): ToolManifest<CostSummaryInput> {
  return {
    name: "get_aws_cost_summary",
    title: PUBLIC_TOOL_TITLES.get_aws_cost_summary,
    description: "Returns the total AWS cost for a given time period via Cost Explorer.",
    pack: "cost",
    lifecycle: "stable",
    inputSchema: costSummaryInputSchema,
    outputSchema: costSummaryOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cost", "billing", "spend", "total", "cost explorer", "budget"],
      docsAnchor: "2-get_aws_cost_summary",
      inputSummary: "startDate, endDate (YYYY-MM-DD), optional granularity DAILY or MONTHLY.",
      awsService: "ce",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ce"],
      actions: ["ce:GetCostAndUsage"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 1800,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    audit: {
      awsService: "ce",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeCostDateRangeInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CostSummaryInput) => {
      const result = await getCostSummary(
        {
          startDate: args.startDate,
          endDate: args.endDate,
          granularity: args.granularity,
        },
        ctx.credentials,
        ctx.region,
        ctx.cache,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `AWS cost from ${result.period.startDate} to ${result.period.endDate} is ${result.total} ${result.currency}.`,
          },
        ],
        structuredContent: {
          period: result.period,
          granularity: args.granularity,
          total: result.total,
          currency: result.currency,
        },
      };
    },
  };
}

export function createCostSummaryToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return manifestToGatewayDefinition(createCostSummaryToolManifest(ctx));
}
