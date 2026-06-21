import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { filterLogEvents, LogsError } from "../../../aws/logs/index.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeLogErrorsInput } from "../../audit/tool-input.js";
import { safeMcpHandler } from "../response.js";
import {
  AWS_READ_ONLY_ANNOTATIONS,
  recentLogErrorsOutputSchema,
  OAUTH_SECURITY_SCHEMES,
} from "../descriptor.js";
import type { GatewayToolDefinition } from "../registry.js";

const recentLogErrorsInputSchema = z.object({
  region: z.string().describe("AWS region (must be in the allowed regions list)."),
  logGroupName: z.string().describe("CloudWatch log group name."),
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
});

type RecentLogErrorsInput = z.infer<typeof recentLogErrorsInputSchema>;

export function createGetRecentLogErrorsToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  const securitySchemes = [...OAUTH_SECURITY_SCHEMES];

  return {
    name: "get_recent_log_errors",
    title: "Recent CloudWatch log errors",
    description:
      "Returns recent error, exception, and warning log events from a CloudWatch log group.",
    inputSchema: recentLogErrorsInputSchema,
    outputSchema: recentLogErrorsOutputSchema,
    annotations: AWS_READ_ONLY_ANNOTATIONS,
    securitySchemes,
    _meta: { securitySchemes },
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["logs", "cloudwatch logs", "errors", "log group", "debug"],
      docsAnchor: "6-get_recent_log_errors",
      inputSummary: "region, logGroupName, optional limit and lookback hours.",
      awsService: "logs",
    },
    handler: safeMcpHandler(
      {
        toolName: "get_recent_log_errors",
        awsService: "logs",
        getRegion: (args: RecentLogErrorsInput) => args.region,
        sanitizeInput: (args) => summarizeLogErrorsInput(args),
      },
      async (args: RecentLogErrorsInput) => {
        validateRegion(args.region, ctx.allowedRegions);

        if (!args.logGroupName || args.logGroupName.trim().length === 0) {
          throw new LogsError("validation_error", "logGroupName is required.");
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

        const text = `Found ${count} error log event(s) in ${args.logGroupName} (${args.region}, last ${args.hours}h).`;

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
      },
    ),
  };
}
