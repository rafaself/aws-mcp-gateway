import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { getCostSummary } from "../../aws/cost-explorer/index.js";
import { safeMcpHandler } from "./response.js";

export function registerCostSummaryTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "get_aws_cost_summary",
    {
      description: "Returns the total AWS cost for a given time period via Cost Explorer.",
      inputSchema: z.object({
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
      }),
    },
    safeMcpHandler(
      {
        toolName: "get_aws_cost_summary",
        awsService: "ce",
        getRegion: () => ctx.region,
        sanitizeInput: (args) => ({
          hasDateRange: true,
          granularity: args.granularity,
        }),
      },
      async (args) => {
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
    }),
  );
}
