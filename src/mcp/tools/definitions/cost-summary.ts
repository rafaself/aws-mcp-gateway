import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getCostSummary } from "../../../aws/cost-explorer/index.js";
import { summarizeCostDateRangeInput } from "../../audit/tool-input.js";
import { safeMcpHandler } from "../response.js";
import {
  AWS_READ_ONLY_ANNOTATIONS,
  costSummaryOutputSchema,
  OAUTH_SECURITY_SCHEMES,
} from "../descriptor.js";
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

export function createCostSummaryToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  const securitySchemes = [...OAUTH_SECURITY_SCHEMES];

  return {
    name: "get_aws_cost_summary",
    title: "AWS cost summary",
    description: "Returns the total AWS cost for a given time period via Cost Explorer.",
    inputSchema: costSummaryInputSchema,
    outputSchema: costSummaryOutputSchema,
    annotations: AWS_READ_ONLY_ANNOTATIONS,
    securitySchemes,
    _meta: { securitySchemes },
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cost", "billing", "spend", "total", "cost explorer", "budget"],
      docsAnchor: "2-get_aws_cost_summary",
      inputSummary: "startDate, endDate (YYYY-MM-DD), optional granularity DAILY or MONTHLY.",
      awsService: "ce",
    },
    handler: safeMcpHandler(
      {
        toolName: "get_aws_cost_summary",
        awsService: "ce",
        getRegion: () => ctx.region,
        sanitizeInput: (args) => summarizeCostDateRangeInput(args),
      },
      async (args: CostSummaryInput) => {
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
    ),
  };
}
