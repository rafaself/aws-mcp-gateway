import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listAlarms, VALID_ALARM_STATES } from "../../../aws/cloudwatch/index.js";
import { resolveRegions } from "../../../security/regions.js";
import { summarizeRegionListInput } from "../../audit/tool-input.js";
import {
  cloudwatchAlarmsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { manifestToGatewayDefinitionForContext, type GatewayToolDefinition } from "../registry.js";

const cloudwatchAlarmsInputSchema = z.object({
  regions: z
    .array(z.string())
    .optional()
    .describe("AWS regions to query (defaults to all allowed regions)."),
  states: z
    .array(z.enum(VALID_ALARM_STATES))
    .optional()
    .describe("Filter by alarm states."),
});

type CloudwatchAlarmsInput = z.infer<typeof cloudwatchAlarmsInputSchema>;

export function createGetCloudwatchAlarmsToolManifest(
  ctx: GatewayContext,
): ToolManifest<CloudwatchAlarmsInput> {
  return {
    name: "get_cloudwatch_alarms",
    title: PUBLIC_TOOL_TITLES.get_cloudwatch_alarms,
    description:
      "Lists CloudWatch alarms across regions with optional state and region filtering.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: cloudwatchAlarmsInputSchema,
    outputSchema: cloudwatchAlarmsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cloudwatch", "alarms", "monitoring", "alert", "metrics"],
      docsAnchor: "5-get_cloudwatch_alarms",
      inputSummary: "Optional regions[] and state ALARM, OK, or INSUFFICIENT_DATA.",
      awsService: "cloudwatch",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["cloudwatch"],
      actions: ["cloudwatch:DescribeAlarms"],
      regionMode: "bounded-multi-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 300,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    audit: {
      awsService: "monitoring",
      sanitizeInput: (args) => summarizeRegionListInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CloudwatchAlarmsInput) => {
      const queriedRegions = resolveRegions(args.regions, ctx.allowedRegions);

      const alarms = await listAlarms(
        {
          regions: queriedRegions,
          stateFilter: args.states,
        },
        ctx.allowedRegions,
        ctx.credentials,
        ctx.cache,
      );
      const count = alarms.length;

      const alarmEntries = alarms.map((a) => ({
        name: a.name,
        region: a.region,
        state: a.state,
        reason: a.reason,
        updatedAt: a.updatedAt,
      }));

      const byState = alarms.reduce<Record<string, typeof alarmEntries>>((acc, a) => {
        (acc[a.state] ??= []).push({
          name: a.name,
          region: a.region,
          state: a.state,
          reason: a.reason,
          updatedAt: a.updatedAt,
        });
        return acc;
      }, {});

      const stateOrder = ["ALARM", "INSUFFICIENT_DATA", "OK"];
      const sections: string[] = [];
      for (const state of stateOrder) {
        const entries = byState[state];
        if (!entries || entries.length === 0) continue;
        sections.push(`${state} (${entries.length}):`);
        for (const e of entries) {
          sections.push(`  - ${e.name} (${e.region}): ${e.reason}`);
        }
      }

      const text =
        `Found ${count} alarm(s) across ${queriedRegions.length} region(s).\n\n` +
        sections.join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
        structuredContent: {
          regions: queriedRegions,
          count,
          alarms: alarmEntries,
        },
      };
    },
  };
}

export function createGetCloudwatchAlarmsToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(ctx, createGetCloudwatchAlarmsToolManifest(ctx) as AnyToolManifest);
}
