import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getRdsInstanceMetrics } from "../../../aws/cloudwatch/index.js";
import { assertInstanceExists, validateLookbackMinutes, validatePeriodSeconds } from "../../../aws/rds/index.js";
import {
  RDS_CACHE_TTL_SECONDS,
  RDS_DEFAULT_LOOKBACK_MINUTES,
  RDS_DEFAULT_PERIOD_SECONDS,
  RDS_MAX_LOOKBACK_MINUTES,
  RDS_MAX_PERIOD_SECONDS,
  RDS_MIN_PERIOD_SECONDS,
} from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeRdsMetricsInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  rdsMetricsOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const rdsMetricsInputSchema = z.object({
  dbInstanceIdentifier: z
    .string()
    .describe("RDS DB instance identifier (direct resource name; profiles are not required)."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
  lookbackMinutes: z
    .number()
    .int()
    .min(1)
    .max(RDS_MAX_LOOKBACK_MINUTES)
    .default(RDS_DEFAULT_LOOKBACK_MINUTES)
    .describe(
      `Minutes to look back (1–${RDS_MAX_LOOKBACK_MINUTES}, default ${RDS_DEFAULT_LOOKBACK_MINUTES}).`,
    ),
  periodSeconds: z
    .number()
    .int()
    .min(RDS_MIN_PERIOD_SECONDS)
    .max(RDS_MAX_PERIOD_SECONDS)
    .default(RDS_DEFAULT_PERIOD_SECONDS)
    .describe(
      `CloudWatch metric period in seconds (${RDS_MIN_PERIOD_SECONDS}–${RDS_MAX_PERIOD_SECONDS}, default ${RDS_DEFAULT_PERIOD_SECONDS}).`,
    ),
});

type RdsMetricsInput = z.infer<typeof rdsMetricsInputSchema>;

export function createGetRdsMetricsToolManifest(
  ctx: GatewayContext,
): ToolManifest<RdsMetricsInput> {
  return {
    name: "get_rds_metrics",
    title: PUBLIC_TOOL_TITLES.get_rds_metrics,
    description:
      "Returns bounded recent CloudWatch metrics for an RDS DB instance. No application profile is required.",
    pack: "database",
    lifecycle: "stable",
    inputSchema: rdsMetricsInputSchema,
    outputSchema: rdsMetricsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["rds", "database", "metrics", "cloudwatch", "cpu", "connections"],
      docsAnchor: "19-get_rds_metrics",
      inputSummary:
        "dbInstanceIdentifier, optional region, lookbackMinutes, and periodSeconds.",
      awsService: "rds",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["rds", "cloudwatch"],
      actions: ["rds:DescribeDBInstances", "cloudwatch:GetMetricData"],
      capabilities: ["rds:DescribeDBInstances", "cloudwatch:GetMetricData"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: RDS_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "volume-sensitive",
      requiresCache: true,
      timeoutMs: 15000,
      maxLookbackHours: RDS_MAX_LOOKBACK_MINUTES / 60,
      minCacheTtlSeconds: RDS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "rds",
      getRegion: (args: RdsMetricsInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeRdsMetricsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: RdsMetricsInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const lookbackMinutes = validateLookbackMinutes(args.lookbackMinutes);
      const periodSeconds = validatePeriodSeconds(args.periodSeconds);

      await assertInstanceExists(
        args.dbInstanceIdentifier,
        region,
        ctx.credentials,
        ctx.execution,
      );

      const metricsResult = await getRdsInstanceMetrics(
        args.dbInstanceIdentifier,
        region,
        {
          lookbackMinutes,
          periodSeconds,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const withData = metricsResult.metrics.filter((m) => m.status === "ok").length;
      const text =
        `RDS metrics for ${metricsResult.dbInstanceIdentifier} (${region}, last ${metricsResult.lookbackMinutes}m): ` +
        `${withData}/${metricsResult.metrics.length} metric series with data.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          ...metricsResult,
          lookbackMinutes,
          periodSeconds,
        },
      };
    },
  };
}
