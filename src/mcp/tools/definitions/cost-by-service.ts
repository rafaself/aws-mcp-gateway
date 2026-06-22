import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getCostByService } from "../../../aws/cost-explorer/index.js";
import { summarizeCostDateRangeInput } from "../../audit/tool-input.js";
import {
  costByServiceOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  manifestToGatewayDefinition,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { buildToolPolicyContext } from "../policy.js";
import type { GatewayToolDefinition } from "../registry.js";

const costByServiceInputSchema = z.object({
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
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe("Maximum number of services to return (max 25)."),
});

type CostByServiceInput = z.infer<typeof costByServiceInputSchema>;

export function createCostByServiceToolManifest(
  ctx: GatewayContext,
): ToolManifest<CostByServiceInput> {
  return {
    name: "get_aws_cost_by_service",
    title: PUBLIC_TOOL_TITLES.get_aws_cost_by_service,
    description:
      "Returns AWS costs broken down by service for a given time period via Cost Explorer.",
    pack: "cost",
    lifecycle: "stable",
    inputSchema: costByServiceInputSchema,
    outputSchema: costByServiceOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cost", "service", "breakdown", "billing", "cost explorer"],
      docsAnchor: "3-get_aws_cost_by_service",
      inputSummary: "startDate, endDate, optional granularity and limit (max 25).",
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
    handler: async (args: CostByServiceInput) => {
      const result = await getCostByService(
        {
          startDate: args.startDate,
          endDate: args.endDate,
          granularity: args.granularity,
        },
        ctx.credentials,
        ctx.region,
        ctx.cache,
      );

      const services = result.services.slice(0, args.limit);

      const lines = services.map(
        (s) => `${s.service}: ${s.amount.toFixed(2)} ${result.currency}`,
      );

      return {
        content: [
          {
            type: "text" as const,
            text:
              `AWS cost from ${result.period.startDate} to ${result.period.endDate} is ${result.total} ${result.currency}.\n` +
              `Top services by cost:\n${lines.join("\n")}`,
          },
        ],
        structuredContent: {
          period: result.period,
          granularity: args.granularity,
          total: result.total,
          currency: result.currency,
          services,
        },
      };
    },
  };
}

export function createCostByServiceToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  const manifest = createCostByServiceToolManifest(ctx);
  const policyContext = buildToolPolicyContext(ctx, [manifest as AnyToolManifest]);
  return manifestToGatewayDefinition(manifest, policyContext);
}
