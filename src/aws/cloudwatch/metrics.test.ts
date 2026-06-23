import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRdsInstanceMetrics } from "./metrics.js";
import type { AwsCredentials } from "../types.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

function metricDataJsonResponse(results: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ MetricDataResults: results }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("getRdsInstanceMetrics", () => {
  it("builds GetMetricData request with RDS dimensions and bounded period", async () => {
    mockFetch.mockResolvedValue(
      metricDataJsonResponse([
        {
          Id: "CPUUtilization",
          Timestamps: [1_718_000_000_000],
          Values: [12.5],
        },
      ]),
    );

    const result = await getRdsInstanceMetrics(
      "my-db",
      "us-east-1",
      { lookbackMinutes: 60, periodSeconds: 300 },
      credentials,
    );

    const init = mockFetch.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      MetricDataQueries: Array<{
        Id: string;
        MetricStat: { Period: number; Metric: { Dimensions: Array<{ Name: string; Value: string }> } };
      }>;
    };

    expect(body.MetricDataQueries).toHaveLength(8);
    expect(body.MetricDataQueries[0]).toMatchObject({
      Id: "CPUUtilization",
      MetricStat: {
        Period: 300,
        Metric: {
          Dimensions: [{ Name: "DBInstanceIdentifier", Value: "my-db" }],
        },
      },
    });

    expect(result.metrics.find((m) => m.name === "CPUUtilization")).toMatchObject({
      status: "ok",
      datapoints: [{ value: 12.5 }],
    });
    expect(result.metrics.find((m) => m.name === "ReadIOPS")).toMatchObject({
      status: "no_data",
      datapoints: [],
    });
  });

  it("caps datapoint count", async () => {
    const timestamps = Array.from({ length: 80 }, (_, i) => 1_718_000_000_000 + i * 60_000);
    const values = timestamps.map((_, i) => i);

    mockFetch.mockResolvedValue(
      metricDataJsonResponse([
        { Id: "CPUUtilization", Timestamps: timestamps, Values: values },
      ]),
    );

    const result = await getRdsInstanceMetrics(
      "my-db",
      "us-east-1",
      { lookbackMinutes: 60, periodSeconds: 60 },
      credentials,
    );

    const cpu = result.metrics.find((m) => m.name === "CPUUtilization");
    expect(cpu?.datapoints).toHaveLength(60);
    expect(cpu?.datapoints[0]?.value).toBe(20);
  });
});
