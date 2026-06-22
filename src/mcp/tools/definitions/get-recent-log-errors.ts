import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { filterLogEvents, LogsError } from "../../../aws/logs/index.js";
import { LOGS_MAX_HOURS, LOGS_MAX_EVENTS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeLogErrorsInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  recentLogErrorsOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

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

export function createGetRecentLogErrorsToolManifest(
  ctx: GatewayContext,
): ToolManifest<RecentLogErrorsInput> {
  return {
    name: "get_recent_log_errors",
    title: PUBLIC_TOOL_TITLES.get_recent_log_errors,
    description:
      "Returns recent error, exception, and warning log events from a CloudWatch log group.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: recentLogErrorsInputSchema,
    outputSchema: recentLogErrorsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["logs", "cloudwatch logs", "errors", "log group", "debug"],
      docsAnchor: "6-get_recent_log_errors",
      inputSummary: "region, logGroupName, optional limit and lookback hours.",
      awsService: "logs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["logs"],
      actions: ["logs:FilterLogEvents"],
      capabilities: ["logs:FilterLogEvents"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 300,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "volume-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxLookbackHours: LOGS_MAX_HOURS,
      maxResultCount: LOGS_MAX_EVENTS,
      minCacheTtlSeconds: 300,
    },
    audit: {
      awsService: "logs",
      getRegion: (args: RecentLogErrorsInput) => args.region,
      sanitizeInput: (args) => summarizeLogErrorsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: RecentLogErrorsInput) => {
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
  };
}
