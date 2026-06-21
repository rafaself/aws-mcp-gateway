import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listAlarms, VALID_ALARM_STATES } from "../../../aws/cloudwatch/index.js";
import { resolveRegions } from "../../../security/regions.js";
import { summarizeRegionListInput } from "../../audit/tool-input.js";
import { safeMcpHandler } from "../response.js";
import {
  AWS_READ_ONLY_ANNOTATIONS,
  cloudwatchAlarmsOutputSchema,
  OAUTH_SECURITY_SCHEMES,
} from "../descriptor.js";
import type { GatewayToolDefinition } from "../registry.js";

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

export function createGetCloudwatchAlarmsToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  const securitySchemes = [...OAUTH_SECURITY_SCHEMES];

  return {
    name: "get_cloudwatch_alarms",
    title: "CloudWatch alarms",
    description:
      "Lists CloudWatch alarms across regions with optional state and region filtering.",
    inputSchema: cloudwatchAlarmsInputSchema,
    outputSchema: cloudwatchAlarmsOutputSchema,
    annotations: AWS_READ_ONLY_ANNOTATIONS,
    securitySchemes,
    _meta: { securitySchemes },
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["cloudwatch", "alarms", "monitoring", "alert", "metrics"],
      docsAnchor: "5-get_cloudwatch_alarms",
      inputSummary: "Optional regions[] and state ALARM, OK, or INSUFFICIENT_DATA.",
      awsService: "cloudwatch",
    },
    handler: safeMcpHandler(
      {
        toolName: "get_cloudwatch_alarms",
        awsService: "monitoring",
        sanitizeInput: (args) => summarizeRegionListInput(args),
      },
      async (args: CloudwatchAlarmsInput) => {
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
    ),
  };
}
