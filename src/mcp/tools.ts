import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AwsCredentials } from "../aws/types.js";
import { getCostSummary } from "../aws/cost-explorer.js";
import { GatewayError, mcpErrorResult } from "../errors.js";

export interface GatewayContext {
  credentials: AwsCredentials;
  region: string;
  allowedRegions: string[];
}

export function registerDiagnosticTools(server: McpServer): void {
  server.registerTool(
    "get_gateway_status",
    {
      description: "Returns the current gateway status. Use this to verify the MCP server is running.",
    },
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            service: "aws-mcp-gateway",
            status: "ok",
            mode: "read-only",
          }),
        },
      ],
    }),
  );
}

export function registerCostTools(server: McpServer, ctx: GatewayContext): void {
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
    async (args) => {
      try {
        const result = await getCostSummary(
          {
            startDate: args.startDate,
            endDate: args.endDate,
            granularity: args.granularity,
          },
          ctx.credentials,
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
      } catch (error) {
        if (error instanceof GatewayError) {
          return mcpErrorResult(error);
        }

        return mcpErrorResult(
          new GatewayError("internal_error", "An unexpected error occurred."),
        );
      }
    },
  );
}
