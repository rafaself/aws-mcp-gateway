import type { GatewayContext } from "../../../config/context.js";
import { getCostSummary, getCostByService } from "../../../aws/cost-explorer/index.js";

export type CostOverviewInput = {
  startDate: string;
  endDate: string;
  granularity?: "DAILY" | "MONTHLY";
  serviceLimit?: number;
};

export type CostOverviewResult = {
  period: { startDate: string; endDate: string };
  granularity: "DAILY" | "MONTHLY";
  total: number;
  currency: string;
  services: Array<{ service: string; amount: number }>;
};

export async function buildCostOverview(
  ctx: GatewayContext,
  args: CostOverviewInput,
  serviceLimit: number,
): Promise<CostOverviewResult> {
  const granularity = args.granularity ?? "MONTHLY";
  const costOptions = {
    startDate: args.startDate,
    endDate: args.endDate,
    granularity,
  };

  const [summary, byService] = await Promise.all([
    getCostSummary(costOptions, ctx.credentials, ctx.region, ctx.cache),
    getCostByService(costOptions, ctx.credentials, ctx.region, ctx.cache),
  ]);

  return {
    period: summary.period,
    granularity,
    total: summary.total,
    currency: summary.currency,
    services: byService.services.slice(0, serviceLimit),
  };
}

export function formatCostOverviewText(result: CostOverviewResult): string {
  const lines = result.services.map(
    (s) => `${s.service}: ${s.amount.toFixed(2)} ${result.currency}`,
  );

  return (
    `AWS cost from ${result.period.startDate} to ${result.period.endDate} is ${result.total} ${result.currency}.\n` +
    `Top services by cost:\n${lines.join("\n")}`
  );
}
