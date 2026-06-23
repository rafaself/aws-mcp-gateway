import { awsRequest } from "../client.js";
import type { AwsCredentials } from "../types.js";
import type {
  CostExplorerOptions,
  CostMetric,
  CostSummary,
  CostByServiceResult,
  CeResponse,
} from "./types.js";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { validateCostDates } from "../../security/dates.js";
import { validateGranularity, validateMetric, buildRequest } from "./requests.js";
import { parseAmount, getMetric } from "./parse.js";

const DEFAULT_METRIC: CostMetric = "UnblendedCost";
const DEFAULT_REGION = "us-east-1";

export async function getCostSummary(
  options: CostExplorerOptions,
  credentials: AwsCredentials,
  signingRegion = DEFAULT_REGION,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
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

  const cacheKey = await buildCacheKey("get_aws_cost_summary", {
    startDate,
    endDate,
    granularity,
    metric,
  });
  const { value: cached } = await cacheReadWithStatus<CostSummary>(cache, cacheKey, execution);
  if (cached) return cached;

  const body = buildRequest(startDate, endDate, granularity, metric);

  const response = await awsRequest<CeResponse>(
    {
      capability: "ce:GetCostAndUsage",
      service: "ce",
      region: signingRegion,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body,
      execution,
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
  execution?: ExecutionTelemetry,
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

  const cacheKey = await buildCacheKey("get_aws_cost_by_service", {
    startDate,
    endDate,
    granularity,
    metric,
  });
  const { value: cached } = await cacheReadWithStatus<CostByServiceResult>(cache, cacheKey, execution);
  if (cached) return cached;

  const body = buildRequest(startDate, endDate, granularity, metric, [
    { Type: "DIMENSION", Key: "SERVICE" },
  ]);

  const response = await awsRequest<CeResponse>(
    {
      capability: "ce:GetCostAndUsage",
      service: "ce",
      region: signingRegion,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "AWSInsightsIndexService.GetCostAndUsage",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body,
      execution,
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
