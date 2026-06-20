import { CostExplorerError, type CostGranularity, type CostMetric } from "./types.js";

export const SUPPORTED_GRANULARITIES = new Set<CostGranularity>(["DAILY", "MONTHLY"]);
export const SUPPORTED_METRICS = new Set<CostMetric>(["UnblendedCost", "AmortizedCost"]);

export function validateGranularity(granularity: string): void {
  if (!SUPPORTED_GRANULARITIES.has(granularity as CostGranularity)) {
    throw new CostExplorerError(
      "validation_error",
      "Unsupported Cost Explorer granularity.",
    );
  }
}

export function validateMetric(metric: string): void {
  if (!SUPPORTED_METRICS.has(metric as CostMetric)) {
    throw new CostExplorerError(
      "validation_error",
      "Unsupported Cost Explorer metric.",
    );
  }
}

export function buildRequest(
  startDate: string,
  endDate: string,
  granularity: string,
  metric: string,
  groupBy?: Array<{ Type: string; Key: string }>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    TimePeriod: { Start: startDate, End: endDate },
    Granularity: granularity,
    Metrics: [metric],
  };

  if (groupBy && groupBy.length > 0) {
    body.GroupBy = groupBy;
  }

  return body;
}
