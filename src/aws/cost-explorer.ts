import { awsRequest } from "./client.js";
import type { AwsCredentials } from "./types.js";
import type {
  CostExplorerOptions,
  CostMetric,
  CostSummary,
  CostByServiceResult,
  CostGranularity,
} from "./cost-types.js";

const DEFAULT_METRIC: CostMetric = "UnblendedCost";
const DEFAULT_REGION = "us-east-1";
const MAX_DATE_RANGE_DAYS = 90;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const SUPPORTED_GRANULARITIES = new Set<CostGranularity>(["DAILY", "MONTHLY"]);
const SUPPORTED_METRICS = new Set<CostMetric>(["UnblendedCost", "AmortizedCost"]);

export class CostExplorerError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CostExplorerError";
    this.code = code;
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

function parseIsoDate(value: string): Date {
  if (!DATE_REGEX.test(value)) {
    throw new CostExplorerError(
      "invalid_date_format",
      "Dates must be in YYYY-MM-DD format.",
    );
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new CostExplorerError(
      "invalid_date",
      "Dates must be valid calendar dates.",
    );
  }

  return date;
}

function validateCostDates(startDate: string, endDate: string): void {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (start >= end) {
    throw new CostExplorerError(
      "invalid_date_range",
      "startDate must be before endDate.",
    );
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > MAX_DATE_RANGE_DAYS) {
    throw new CostExplorerError(
      "date_range_exceeded",
      "Date range must not exceed 90 days.",
    );
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

  return {
    period: { startDate, endDate },
    currency,
    total: totalValue,
  };
}

export async function getCostByService(
  options: CostExplorerOptions,
  credentials: AwsCredentials,
  signingRegion = DEFAULT_REGION,
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

  return {
    period: { startDate, endDate },
    currency,
    total: totalValue,
    services,
  };
}
