import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import {
  RDS_CACHE_TTL_SECONDS,
  RDS_MAX_METRIC_DATAPOINTS,
  S3_METRIC_LOOKBACK_MINUTES,
  S3_METRIC_PERIOD_SECONDS,
} from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import { awsRequest } from "../client.js";
import type { AwsCredentials } from "../types.js";
import { validateLookbackMinutes, validatePeriodSeconds } from "../rds/validation.js";

export type RdsMetricName =
  | "CPUUtilization"
  | "DatabaseConnections"
  | "FreeStorageSpace"
  | "FreeableMemory"
  | "ReadIOPS"
  | "WriteIOPS"
  | "ReadLatency"
  | "WriteLatency";

export type RdsMetricStatus = "ok" | "no_data";

export interface RdsMetricDatapoint {
  timestamp: string;
  value: number;
}

export interface RdsMetricSeries {
  name: RdsMetricName;
  unit: string;
  status: RdsMetricStatus;
  datapoints: RdsMetricDatapoint[];
}

export interface RdsInstanceMetricsResult {
  dbInstanceIdentifier: string;
  region: string;
  lookbackMinutes: number;
  periodSeconds: number;
  metrics: RdsMetricSeries[];
}

const REQUIRED_METRICS: readonly RdsMetricName[] = [
  "CPUUtilization",
  "DatabaseConnections",
  "FreeStorageSpace",
  "FreeableMemory",
] as const;

const OPTIONAL_METRICS: readonly RdsMetricName[] = [
  "ReadIOPS",
  "WriteIOPS",
  "ReadLatency",
  "WriteLatency",
] as const;

const METRIC_UNITS: Record<RdsMetricName, string> = {
  CPUUtilization: "Percent",
  DatabaseConnections: "Count",
  FreeStorageSpace: "Bytes",
  FreeableMemory: "Bytes",
  ReadIOPS: "Count/Second",
  WriteIOPS: "Count/Second",
  ReadLatency: "Seconds",
  WriteLatency: "Seconds",
};

interface GetMetricDataResponse {
  MetricDataResults?: Array<{
    Id?: string;
    Label?: string;
    StatusCode?: string;
    Timestamps?: number[];
    Values?: number[];
  }>;
}

function buildMetricQueries(
  dbInstanceIdentifier: string,
  metrics: readonly RdsMetricName[],
): Array<Record<string, unknown>> {
  return metrics.map((metricName) => ({
    Id: metricName,
    MetricStat: {
      Metric: {
        Namespace: "AWS/RDS",
        MetricName: metricName,
        Dimensions: [
          {
            Name: "DBInstanceIdentifier",
            Value: dbInstanceIdentifier,
          },
        ],
      },
      Period: 0,
      Stat: "Average",
    },
    ReturnData: true,
  }));
}

function normalizeDatapoints(
  timestamps: number[] | undefined,
  values: number[] | undefined,
): RdsMetricDatapoint[] {
  if (!timestamps || !values || timestamps.length === 0) {
    return [];
  }

  const pairs: RdsMetricDatapoint[] = [];
  const count = Math.min(timestamps.length, values.length);
  for (let i = 0; i < count; i++) {
    pairs.push({
      timestamp: new Date(timestamps[i]).toISOString(),
      value: values[i],
    });
  }

  pairs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return pairs.slice(-RDS_MAX_METRIC_DATAPOINTS);
}

function normalizeMetricSeries(
  metricName: RdsMetricName,
  result:
    | {
        Id?: string;
        Label?: string;
        StatusCode?: string;
        Timestamps?: number[];
        Values?: number[];
      }
    | undefined,
): RdsMetricSeries {
  const datapoints = normalizeDatapoints(result?.Timestamps, result?.Values);
  return {
    name: metricName,
    unit: METRIC_UNITS[metricName],
    status: datapoints.length > 0 ? "ok" : "no_data",
    datapoints,
  };
}

export async function getRdsInstanceMetrics(
  dbInstanceIdentifier: string,
  region: string,
  options: {
    lookbackMinutes?: number;
    periodSeconds?: number;
  },
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
): Promise<RdsInstanceMetricsResult> {
  const lookbackMinutes = validateLookbackMinutes(options.lookbackMinutes);
  const periodSeconds = validatePeriodSeconds(options.periodSeconds);

  const cacheKey = await buildCacheKey("get_rds_metrics", {
    dbInstanceIdentifier,
    region,
    lookbackMinutes,
    periodSeconds,
  });
  const { value: cached } = await cacheReadWithStatus<RdsInstanceMetricsResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - lookbackMinutes * 60 * 1000);
  const allMetrics = [...REQUIRED_METRICS, ...OPTIONAL_METRICS];
  const queries = buildMetricQueries(dbInstanceIdentifier, allMetrics).map((query) => ({
    ...query,
    MetricStat: {
      ...(query.MetricStat as Record<string, unknown>),
      Period: periodSeconds,
    },
  }));

  const response = await awsRequest<GetMetricDataResponse>(
    {
      capability: "cloudwatch:GetMetricData",
      service: "monitoring",
      region,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "GraniteServiceVersion20100801.GetMetricData",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body: {
        StartTime: startTime.toISOString(),
        EndTime: endTime.toISOString(),
        MetricDataQueries: queries,
        ScanBy: "TimestampAscending",
      },
      execution,
    },
    credentials,
  );

  const resultsById = new Map(
    (response.MetricDataResults ?? []).map((result) => [result.Id ?? "", result]),
  );

  const metrics = allMetrics.map((metricName) =>
    normalizeMetricSeries(metricName, resultsById.get(metricName)),
  );

  const result: RdsInstanceMetricsResult = {
    dbInstanceIdentifier,
    region,
    lookbackMinutes,
    periodSeconds,
    metrics,
  };

  if (cache) {
    await cacheSet(cache, cacheKey, result, RDS_CACHE_TTL_SECONDS);
  }

  return result;
}

export interface S3BucketMetricsResult {
  bucketSizeBytes?: number;
  objectCount?: number;
  asOf?: string;
}

export async function getS3BucketMetrics(
  bucketName: string,
  region: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<S3BucketMetricsResult | undefined> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - S3_METRIC_LOOKBACK_MINUTES * 60 * 1000);

  const queries = [
    {
      Id: "BucketSizeBytes",
      MetricStat: {
        Metric: {
          Namespace: "AWS/S3",
          MetricName: "BucketSizeBytes",
          Dimensions: [
            { Name: "BucketName", Value: bucketName },
            { Name: "StorageType", Value: "StandardStorage" },
          ],
        },
        Period: S3_METRIC_PERIOD_SECONDS,
        Stat: "Average",
      },
      ReturnData: true,
    },
    {
      Id: "NumberOfObjects",
      MetricStat: {
        Metric: {
          Namespace: "AWS/S3",
          MetricName: "NumberOfObjects",
          Dimensions: [
            { Name: "BucketName", Value: bucketName },
            { Name: "StorageType", Value: "AllStorageTypes" },
          ],
        },
        Period: S3_METRIC_PERIOD_SECONDS,
        Stat: "Average",
      },
      ReturnData: true,
    },
  ];

  const response = await awsRequest<GetMetricDataResponse>(
    {
      capability: "cloudwatch:GetMetricData",
      service: "monitoring",
      region,
      method: "POST",
      path: "/",
      headers: {
        "X-Amz-Target": "GraniteServiceVersion20100801.GetMetricData",
        "Content-Type": "application/x-amz-json-1.1",
      },
      body: {
        StartTime: startTime.toISOString(),
        EndTime: endTime.toISOString(),
        MetricDataQueries: queries,
        ScanBy: "TimestampDescending",
      },
      execution,
    },
    credentials,
  );

  const resultsById = new Map(
    (response.MetricDataResults ?? []).map((result) => [result.Id ?? "", result]),
  );

  const sizeResult = resultsById.get("BucketSizeBytes");
  const countResult = resultsById.get("NumberOfObjects");

  const sizeDatapoints = normalizeDatapoints(sizeResult?.Timestamps, sizeResult?.Values);
  const countDatapoints = normalizeDatapoints(countResult?.Timestamps, countResult?.Values);

  if (sizeDatapoints.length === 0 && countDatapoints.length === 0) {
    return undefined;
  }

  const latestTimestamp = [
    sizeDatapoints.at(-1)?.timestamp,
    countDatapoints.at(-1)?.timestamp,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return {
    ...(sizeDatapoints.length > 0
      ? { bucketSizeBytes: sizeDatapoints.at(-1)?.value }
      : {}),
    ...(countDatapoints.length > 0 ? { objectCount: countDatapoints.at(-1)?.value } : {}),
    ...(latestTimestamp ? { asOf: latestTimestamp } : {}),
  };
}
