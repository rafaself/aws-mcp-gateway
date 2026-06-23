import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { summarizeAlarms, VALID_ALARM_STATES } from "../../../aws/cloudwatch/index.js";
import {
  CW_ALARM_PREFIX_MAX_LENGTH,
  CW_CACHE_TTL_SECONDS,
  CW_MAX_ALARMS,
} from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeCloudwatchAlarmSummaryInput } from "../../audit/tool-input.js";
import {
  cloudwatchAlarmSummaryOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const cloudwatchAlarmSummaryInputSchema = z.object({
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
  alarmNamePrefix: z
    .string()
    .max(CW_ALARM_PREFIX_MAX_LENGTH)
    .optional()
    .describe(`Optional alarm name prefix (max ${CW_ALARM_PREFIX_MAX_LENGTH} characters).`),
  stateValue: z
    .enum(VALID_ALARM_STATES)
    .optional()
    .describe("Optional alarm state filter."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(CW_MAX_ALARMS)
    .default(50)
    .describe(`Maximum number of alarms to return (1–${CW_MAX_ALARMS}, default 50).`),
});

type CloudwatchAlarmSummaryInput = z.infer<typeof cloudwatchAlarmSummaryInputSchema>;

export function createGetCloudwatchAlarmSummaryToolManifest(
  ctx: GatewayContext,
): ToolManifest<CloudwatchAlarmSummaryInput> {
  return {
    name: "get_cloudwatch_alarm_summary",
    title: PUBLIC_TOOL_TITLES.get_cloudwatch_alarm_summary,
    description:
      "Returns a normalized CloudWatch alarm summary with grouped state counts for a single region.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: cloudwatchAlarmSummaryInputSchema,
    outputSchema: cloudwatchAlarmSummaryOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cloudwatch", "alarms", "monitoring", "summary", "metrics"],
      docsAnchor: "17-get_cloudwatch_alarm_summary",
      inputSummary: "Optional region, alarmNamePrefix, stateValue, and limit.",
      awsService: "cloudwatch",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["cloudwatch"],
      actions: ["cloudwatch:DescribeAlarms"],
      capabilities: ["cloudwatch:DescribeAlarms"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: CW_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "fanout-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxResultCount: CW_MAX_ALARMS,
      minCacheTtlSeconds: CW_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "monitoring",
      getRegion: (args: CloudwatchAlarmSummaryInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeCloudwatchAlarmSummaryInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CloudwatchAlarmSummaryInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const summary = await summarizeAlarms(
        region,
        {
          alarmNamePrefix: args.alarmNamePrefix,
          stateValue: args.stateValue,
          limit: args.limit,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const count = summary.alarms.length;
      const text =
        `Found ${count} alarm(s) in ${region}. ` +
        `ALARM=${summary.stateCounts.ALARM}, ` +
        `INSUFFICIENT_DATA=${summary.stateCounts.INSUFFICIENT_DATA}, ` +
        `OK=${summary.stateCounts.OK}.`;

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
        structuredContent: {
          region,
          count,
          stateCounts: summary.stateCounts,
          alarms: summary.alarms,
        },
      };
    },
  };
}
