import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { listAlarms } from "../../aws/cloudwatch.js";
import { VALID_ALARM_STATES } from "../../aws/cloudwatch-types.js";
import { resolveRegions } from "../../security/regions.js";
import { safeMcpHandler } from "./response.js";

export function registerGetCloudwatchAlarmsTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "get_cloudwatch_alarms",
    {
      description: "Lists CloudWatch alarms across regions with optional state and region filtering.",
      inputSchema: z.object({
        regions: z
          .array(z.string())
          .optional()
          .describe("AWS regions to query (defaults to all allowed regions)."),
        states: z
          .array(z.enum(VALID_ALARM_STATES))
          .optional()
          .describe("Filter by alarm states."),
      }),
    },
    safeMcpHandler(async (args) => {
      const queriedRegions = resolveRegions(args.regions, ctx.allowedRegions);

      const alarms = await listAlarms(
        {
          regions: queriedRegions,
          stateFilter: args.states,
        },
        ctx.allowedRegions,
        ctx.credentials,
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
        (acc[a.state] ??= []).push({ name: a.name, region: a.region, state: a.state, reason: a.reason, updatedAt: a.updatedAt });
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
    }),
  );
}
