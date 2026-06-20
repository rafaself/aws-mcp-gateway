import { awsRequest } from "./client.js";
import type { AwsCredentials } from "./types.js";
import type {
  CostExplorerOptions,
  CostMetric,
  CostSummary,
  CostByServiceResult,
  CostGranularity,
} from "./cost-types.js";
import { ValidationError } from "../security/errors.js";
import { validateCostDates } from "../security/validation.js";
import { buildCacheKey } from "../cache/keys.js";
import { cacheGet, cacheSet } from "../cache/kv.js";
import type { KVNamespace } from "@cloudflare/workers-types";

const DEFAULT_METRIC: CostMetric = "UnblendedCost";
const DEFAULT_REGION = "us-east-1";

const SUPPORTED_GRANULARITIES = new Set<CostGranularity>(["DAILY", "MONTHLY"]);
const SUPPORTED_METRICS = new Set<CostMetric>(["UnblendedCost", "AmortizedCost"]);

export class CostExplorerError extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "CostExplorerError";
  }
}

function validateGranularity(granularity: string): void {
  if (!SUPPORTED_GRANULARITIES.has(granularity as CostGranularity)) {
    throw new CostExplorerError(
      "unsupported_granularity",
      "Unsupported Cost Explorer granularity.",
    );
  }
}

function validateMetric(metric: string): void {
  if (!SUPPORTED_METRICS.has(metric as CostMetric)) {
    throw new CostExplorerError(
      "unsupported_metric",
      "Unsupported Cost Explorer metric.",
    );
  }
}

interface CeAmount {
  Amount?: string;
  Unit?: string;
}

interface CeGroup {
  Keys?: string[];
  Metrics?: Record<string, CeAmount>;
}

interface CeResultByTime {
  TimePeriod?: { Start?: string; End?: string };
  Total?: Record<string, CeAmount>;
  Groups?: CeGroup[];
}

interface CeResponse {
  ResultsByTime?: CeResultByTime[];
}

function buildRequest(
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

function parseAmount(
  amount: CeAmount | undefined,
  fallbackCurrency: string,
): { value: number; currency: string } {
  const value = amount?.Amount ? parseFloat(amount.Amount) : 0;
  const currency = amount?.Unit ?? fallbackCurrency;
  return { value, currency };
}

function getMetric(
  totals: Record<string, CeAmount> | undefined,
  metric: string,
): CeAmount | undefined {
  return totals?.[metric];
}

export async function getCostSummary(
  options: CostExplorerOptions,
  credentials: AwsCredentials,
  signingRegion = DEFAULT_REGION,
  cache?: KVNamespace,
): Promise<CostSummary> {
  const {
    startDate,
    endDate,
    granularity = "MONTHLY",
    metric = DEFAULT_METRIC,
  } = options;

  validateCostDates(startDate, endDate);
  validateGranularity(granularity);
  validateMetric(metric);

  if (cache) {
    const cacheKey = await buildCacheKey("get_aws_cost_summary", {
      startDate,
      endDate,
      granularity,
      metric,
    });
    const cached = await cacheGet<CostSummary>(cache, cacheKey);
    if (cached) return cached;
  }

  const body = buildRequest(startDate, endDate, granularity, metric);

  const response = await awsRequest<CeResponse>(
    {
      service: "ce",
      region: signingRegion,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body,
    },
    credentials,
  );

  const results = response.ResultsByTime ?? [];

  let totalValue = 0;
  let currency = "USD";

  for (const entry of results) {
    const metricAmount = getMetric(entry.Total, metric);
    const { value, currency: cur } = parseAmount(metricAmount, currency);
    totalValue += value;
    currency = cur;
  }

  const result: CostSummary = {
    period: { startDate, endDate },
    currency,
    total: totalValue,
  };

  if (cache) {
    const cacheKey = await buildCacheKey("get_aws_cost_summary", {
      startDate,
      endDate,
      granularity,
      metric,
    });
    await cacheSet(cache, cacheKey, result);
  }

  return result;
}

export async function getCostByService(
  options: CostExplorerOptions,
  credentials: AwsCredentials,
  signingRegion = DEFAULT_REGION,
  cache?: KVNamespace,
): Promise<CostByServiceResult> {
  const {
    startDate,
    endDate,
    granularity = "MONTHLY",
    metric = DEFAULT_METRIC,
  } = options;

  validateCostDates(startDate, endDate);
  validateGranularity(granularity);
  validateMetric(metric);

  if (cache) {
    const cacheKey = await buildCacheKey("get_aws_cost_by_service", {
      startDate,
      endDate,
      granularity,
      metric,
    });
    const cached = await cacheGet<CostByServiceResult>(cache, cacheKey);
    if (cached) return cached;
  }

  const body = buildRequest(startDate, endDate, granularity, metric, [
    { Type: "DIMENSION", Key: "SERVICE" },
  ]);

  const response = await awsRequest<CeResponse>(
    {
      service: "ce",
      region: signingRegion,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body,
    },
    credentials,
  );

  const results = response.ResultsByTime ?? [];

  let totalValue = 0;
  let currency = "USD";
  const serviceTotals = new Map<string, number>();

  for (const entry of results) {
    const metricAmount = getMetric(entry.Total, metric);
    const { value, currency: cur } = parseAmount(metricAmount, currency);
    totalValue += value;
    currency = cur;

    const groups = entry.Groups ?? [];
    for (const group of groups) {
      const serviceName = group.Keys?.[0] ?? "Unknown";
      const groupMetric = getMetric(group.Metrics, metric);
      const { value: groupValue } = parseAmount(groupMetric, currency);
      serviceTotals.set(
        serviceName,
        (serviceTotals.get(serviceName) ?? 0) + groupValue,
      );
    }
  }

  const services = Array.from(serviceTotals.entries())
    .map(([service, amount]) => ({ service, amount }))
    .sort((a, b) => b.amount - a.amount);

  const result: CostByServiceResult = {
    period: { startDate, endDate },
    currency,
    total: totalValue,
    services,
  };

  if (cache) {
    const cacheKey = await buildCacheKey("get_aws_cost_by_service", {
      startDate,
      endDate,
      granularity,
      metric,
    });
    await cacheSet(cache, cacheKey, result);
  }

  return result;
}
