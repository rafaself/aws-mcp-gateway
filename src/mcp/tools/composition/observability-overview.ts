import type { GatewayContext } from "../../../config/context.js";
import { listAlarms } from "../../../aws/cloudwatch/index.js";
import { describeLogGroups } from "../../../aws/logs/index.js";
import { resolveRegions } from "../../../security/regions.js";
import { takeSample } from "./samples.js";

export type ObservabilityOverviewInclude = "alarms" | "logGroups";

export type ObservabilityOverviewInput = {
  regions?: string[];
  include?: ObservabilityOverviewInclude[];
  limit?: number;
};

export type ObservabilityOverviewAlarmsSection = {
  count: number;
  countsByState: Record<string, number>;
  sample: Array<{
    name: string;
    region: string;
    state: "ALARM" | "INSUFFICIENT_DATA" | "OK";
    reason: string;
    updatedAt: string;
  }>;
};

export type ObservabilityOverviewLogGroupsSection = {
  count: number;
  sample: Array<{
    name: string;
    region: string;
  }>;
};

export type ObservabilityOverviewResult = {
  regions: string[];
  alarms?: ObservabilityOverviewAlarmsSection;
  logGroups?: ObservabilityOverviewLogGroupsSection;
};

export async function buildObservabilityOverview(
  ctx: GatewayContext,
  args: ObservabilityOverviewInput,
  include: readonly ObservabilityOverviewInclude[],
  sampleLimit: number,
): Promise<ObservabilityOverviewResult> {
  const regions = resolveRegions(args.regions, ctx.allowedRegions);
  const result: ObservabilityOverviewResult = { regions };

  const tasks: Promise<void>[] = [];

  if (include.includes("alarms")) {
    tasks.push(
      listAlarms({ regions }, ctx.allowedRegions, ctx.credentials, ctx.cache, ctx.execution).then((alarms) => {
        const countsByState = alarms.reduce<Record<string, number>>((acc, a) => {
          acc[a.state] = (acc[a.state] || 0) + 1;
          return acc;
        }, {});

        result.alarms = {
          count: alarms.length,
          countsByState,
          sample: takeSample(
            alarms.map((a) => ({
              name: a.name,
              region: a.region,
              state: a.state,
              reason: a.reason,
              updatedAt: a.updatedAt,
            })),
            sampleLimit,
          ),
        };
      }),
    );
  }

  if (include.includes("logGroups")) {
    tasks.push(
      (async () => {
        const perRegionLimit = Math.max(1, Math.ceil(sampleLimit));
        const allGroups: Array<{ name: string; region: string }> = [];

        for (const region of regions) {
          const groups = await describeLogGroups(
            { limit: perRegionLimit },
            region,
            ctx.credentials,
            ctx.cache,
            ctx.execution,
          );
          for (const group of groups) {
            allGroups.push({ name: group.name, region });
          }
        }

        result.logGroups = {
          count: allGroups.length,
          sample: takeSample(allGroups, sampleLimit),
        };
      })(),
    );
  }

  await Promise.all(tasks);
  return result;
}

export function formatObservabilityOverviewText(result: ObservabilityOverviewResult): string {
  const lines: string[] = [`Observability overview across ${result.regions.length} region(s).`];

  if (result.alarms) {
    lines.push(`Alarms: ${result.alarms.count}.`);
    const stateLines = Object.entries(result.alarms.countsByState)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, count]) => `  ${state}: ${count}`);
    if (stateLines.length > 0) {
      lines.push("  By state:", ...stateLines);
    }
  }

  if (result.logGroups) {
    lines.push(`Log groups: ${result.logGroups.count}.`);
  }

  return lines.join("\n");
}
