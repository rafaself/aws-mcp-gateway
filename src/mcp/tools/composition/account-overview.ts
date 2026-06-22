import type { GatewayContext } from "../../../config/context.js";
import { listInstances } from "../../../aws/ec2/index.js";
import { listFunctions } from "../../../aws/lambda/index.js";
import { listBuckets } from "../../../aws/s3/index.js";
import { resolveRegions } from "../../../security/regions.js";
import { OVERVIEW_SAMPLE_LIMIT } from "../../../security/limits.js";
import { takeSample } from "./samples.js";

export type AccountOverviewInclude = "ec2" | "lambda" | "s3";

export type AccountOverviewInput = {
  regions?: string[];
  include?: AccountOverviewInclude[];
};

export type AccountOverviewEc2Section = {
  count: number;
  countsByState: Record<string, number>;
  countsByRegion: Record<string, number>;
  sample: Array<{
    instanceId: string;
    region: string;
    state: string;
    instanceType: string;
    name: string;
  }>;
};

export type AccountOverviewLambdaSection = {
  count: number;
  countsByRegion: Record<string, number>;
  sample: Array<{
    functionName: string;
    region: string;
    runtime: string;
    state: string;
  }>;
};

export type AccountOverviewS3Section = {
  count: number;
  sample: Array<{
    name: string;
    createdAt: string;
  }>;
};

export type AccountOverviewResult = {
  regions: string[];
  ec2?: AccountOverviewEc2Section;
  lambda?: AccountOverviewLambdaSection;
  s3?: AccountOverviewS3Section;
};

function countByRegion<T extends { region: string }>(items: readonly T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.region] = (acc[item.region] || 0) + 1;
    return acc;
  }, {});
}

export async function buildAccountOverview(
  ctx: GatewayContext,
  args: AccountOverviewInput,
  include: readonly AccountOverviewInclude[],
): Promise<AccountOverviewResult> {
  const regions = resolveRegions(args.regions, ctx.allowedRegions);
  const result: AccountOverviewResult = { regions };

  const tasks: Promise<void>[] = [];

  if (include.includes("ec2")) {
    tasks.push(
      listInstances({ regions }, ctx.allowedRegions, ctx.credentials, ctx.cache).then((instances) => {
        const countsByState = instances.reduce<Record<string, number>>((acc, i) => {
          acc[i.state] = (acc[i.state] || 0) + 1;
          return acc;
        }, {});

        result.ec2 = {
          count: instances.length,
          countsByState,
          countsByRegion: countByRegion(instances),
          sample: takeSample(
            instances.map((inst) => ({
              instanceId: inst.instanceId,
              region: inst.region,
              state: inst.state,
              instanceType: inst.instanceType,
              name: inst.name,
            })),
            OVERVIEW_SAMPLE_LIMIT,
          ),
        };
      }),
    );
  }

  if (include.includes("lambda")) {
    tasks.push(
      listFunctions({ regions }, ctx.allowedRegions, ctx.credentials, ctx.cache).then((functions) => {
        result.lambda = {
          count: functions.length,
          countsByRegion: countByRegion(functions),
          sample: takeSample(
            functions.map((fn) => ({
              functionName: fn.functionName,
              region: fn.region,
              runtime: fn.runtime,
              state: fn.state,
            })),
            OVERVIEW_SAMPLE_LIMIT,
          ),
        };
      }),
    );
  }

  if (include.includes("s3")) {
    tasks.push(
      listBuckets({}, ctx.credentials, ctx.cache).then((buckets) => {
        result.s3 = {
          count: buckets.length,
          sample: takeSample(
            buckets.map((b) => ({
              name: b.name,
              createdAt: b.createdAt,
            })),
            OVERVIEW_SAMPLE_LIMIT,
          ),
        };
      }),
    );
  }

  await Promise.all(tasks);
  return result;
}

export function formatAccountOverviewText(result: AccountOverviewResult): string {
  const lines: string[] = [`Account overview across ${result.regions.length} region(s).`];

  if (result.ec2) {
    lines.push(`EC2: ${result.ec2.count} instance(s).`);
    const stateLines = Object.entries(result.ec2.countsByState)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, count]) => `  ${state}: ${count}`);
    if (stateLines.length > 0) {
      lines.push("  By state:", ...stateLines);
    }
  }

  if (result.lambda) {
    lines.push(`Lambda: ${result.lambda.count} function(s).`);
  }

  if (result.s3) {
    lines.push(`S3: ${result.s3.count} bucket(s).`);
  }

  return lines.join("\n");
}
