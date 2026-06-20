import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { filterLogEvents } from "../../aws/logs.js";
import { LogsError } from "../../aws/logs-types.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS } from "../../security/limits.js";
import { validateRegion } from "../../security/regions.js";
import { safeMcpHandler } from "./response.js";

export function registerGetRecentLogErrorsTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "get_recent_log_errors",
    {
      description: "Returns recent error, exception, and warning log events from a CloudWatch log group.",
      inputSchema: z.object({
        region: z
          .string()
          .describe("AWS region (must be in the allowed regions list)."),
        logGroupName: z
          .string()
          .describe("CloudWatch log group name."),
        hours: z
          .number()
          .int()
          .min(1)
          .max(LOGS_MAX_HOURS)
          .default(1)
          .describe("Number of hours to look back (1–24, default 1)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(LOGS_MAX_EVENTS)
          .default(20)
          .describe("Maximum number of events to return (1–50, default 20)."),
      }),
    },
    safeMcpHandler(async (args) => {
      validateRegion(args.region, ctx.allowedRegions);

      if (!args.logGroupName || args.logGroupName.trim().length === 0) {
        throw new LogsError("missing_log_group", "logGroupName is required.");
      }

      const now = Date.now();
      const startTime = now - args.hours * 60 * 60 * 1000;

      const events = await filterLogEvents(
        args.logGroupName,
        {
          startTime,
          endTime: now,
          limit: args.limit,
        },
        args.region,
        ctx.credentials,
        ctx.cache,
      );

      const count = events.length;

      const eventEntries = events.map((e) => ({
        timestamp: e.timestamp,
        logStreamName: e.logStreamName,
        message: e.message,
      }));

      const text =
        `Found ${count} error log event(s) in ${args.logGroupName} (${args.region}, last ${args.hours}h).`;

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
        structuredContent: {
          region: args.region,
          logGroupName: args.logGroupName,
          count,
          events: eventEntries,
        },
      };
    }),
  );
}
