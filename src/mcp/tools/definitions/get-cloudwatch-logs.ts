import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import {
  describeLogStreams,
  filterLogEvents,
  LogsError,
} from "../../../aws/logs/index.js";
import {
  LOGS_CACHE_TTL_SECONDS,
  LOGS_DEFAULT_LOOKBACK_MINUTES,
  LOGS_MAX_EVENTS,
  LOGS_MAX_FILTER_PATTERN_LENGTH,
  LOGS_MAX_HOURS,
  LOGS_MAX_LOOKBACK_MINUTES,
  LOG_STREAM_PREFIX_MAX_LENGTH,
} from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeCloudwatchLogsInput } from "../../audit/tool-input.js";
import {
  cloudwatchLogsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const cloudwatchLogsInputSchema = z.object({
  logGroupName: z.string().describe("CloudWatch log group name."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
  logStreamNamePrefix: z
    .string()
    .max(LOG_STREAM_PREFIX_MAX_LENGTH)
    .optional()
    .describe(`Optional log stream name prefix (max ${LOG_STREAM_PREFIX_MAX_LENGTH} characters).`),
  query: z
    .string()
    .max(LOGS_MAX_FILTER_PATTERN_LENGTH)
    .optional()
    .describe(`Optional CloudWatch Logs filter pattern (max ${LOGS_MAX_FILTER_PATTERN_LENGTH} characters).`),
  lookbackMinutes: z
    .number()
    .int()
    .min(1)
    .max(LOGS_MAX_LOOKBACK_MINUTES)
    .default(LOGS_DEFAULT_LOOKBACK_MINUTES)
    .describe(
      `Minutes to look back (1–${LOGS_MAX_LOOKBACK_MINUTES}, default ${LOGS_DEFAULT_LOOKBACK_MINUTES}).`,
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LOGS_MAX_EVENTS)
    .default(20)
    .describe(`Maximum number of events to return (1–${LOGS_MAX_EVENTS}, default 20).`),
});

type CloudwatchLogsInput = z.infer<typeof cloudwatchLogsInputSchema>;

export function createGetCloudwatchLogsToolManifest(
  ctx: GatewayContext,
): ToolManifest<CloudwatchLogsInput> {
  return {
    name: "get_cloudwatch_logs",
    title: PUBLIC_TOOL_TITLES.get_cloudwatch_logs,
    description:
      "Returns bounded, redacted CloudWatch log events from a log group with optional stream prefix and filter pattern.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: cloudwatchLogsInputSchema,
    outputSchema: cloudwatchLogsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["logs", "cloudwatch logs", "log group", "filter", "observability"],
      docsAnchor: "16-get_cloudwatch_logs",
      inputSummary:
        "logGroupName, optional region, stream prefix, query, lookbackMinutes, and limit.",
      awsService: "logs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["logs"],
      actions: ["logs:FilterLogEvents", "logs:DescribeLogStreams"],
      capabilities: ["logs:FilterLogEvents", "logs:DescribeLogStreams"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: LOGS_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "volume-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxLookbackHours: LOGS_MAX_HOURS,
      maxResultCount: LOGS_MAX_EVENTS,
      minCacheTtlSeconds: LOGS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "logs",
      getRegion: (args: CloudwatchLogsInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeCloudwatchLogsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CloudwatchLogsInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      if (!args.logGroupName || args.logGroupName.trim().length === 0) {
        throw new LogsError("validation_error", "logGroupName is required.");
      }

      if (args.logStreamNamePrefix) {
        const streams = await describeLogStreams(
          args.logGroupName,
          { logStreamNamePrefix: args.logStreamNamePrefix, limit: 1 },
          region,
          ctx.credentials,
          ctx.cache,
          ctx.execution,
        );

        if (streams.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No log streams matched prefix in ${args.logGroupName} (${region}, last ${args.lookbackMinutes}m).`,
              },
            ],
            structuredContent: {
              region,
              logGroupName: args.logGroupName,
              count: 0,
              lookbackMinutes: args.lookbackMinutes,
              query: args.query ?? "",
              truncated: false,
              events: [],
              ...(args.logStreamNamePrefix
                ? { logStreamNamePrefix: args.logStreamNamePrefix }
                : {}),
            },
          };
        }
      }

      const now = Date.now();
      const startTime = now - args.lookbackMinutes * 60 * 1000;

      const { events, truncated } = await filterLogEvents(
        args.logGroupName,
        {
          filterPattern: args.query,
          logStreamNamePrefix: args.logStreamNamePrefix,
          startTime,
          endTime: now,
          limit: args.limit,
          cacheTool: "get_cloudwatch_logs",
          useDefaultFilterPattern: false,
        },
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const count = events.length;
      const text = `Found ${count} log event(s) in ${args.logGroupName} (${region}, last ${args.lookbackMinutes}m).`;

      return {
        content: [
          {
            type: "text" as const,
            text: truncated ? `${text} Results were truncated at the requested limit.` : text,
          },
        ],
        structuredContent: {
          region,
          logGroupName: args.logGroupName,
          count,
          lookbackMinutes: args.lookbackMinutes,
          query: args.query ?? "",
          truncated,
          events: events.map((event) => ({
            timestamp: event.timestamp,
            logStreamName: event.logStreamName,
            message: event.message,
          })),
          ...(args.logStreamNamePrefix
            ? { logStreamNamePrefix: args.logStreamNamePrefix }
            : {}),
        },
      };
    },
  };
}
