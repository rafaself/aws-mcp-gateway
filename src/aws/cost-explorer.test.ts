import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCostSummary, getCostByService, CostExplorerError } from "./cost-explorer.js";
import { ValidationError } from "../security/errors.js";
import type { AwsCredentials } from "./types.js";

const { mockFetch, awsClientConstructors } = vi.hoisted(() => {
  const mockFetch = vi.fn();
  const awsClientConstructors: Array<Record<string, unknown>> = [];
  return { mockFetch, awsClientConstructors };
});

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    accessKeyId: string;
    secretAccessKey: string;
    service: string | undefined;
    region: string | undefined;
    fetch = mockFetch;

    constructor(opts: {
      accessKeyId: string;
      secretAccessKey: string;
      service?: string;
      region?: string;
    }) {
      awsClientConstructors.push(opts);
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

function ceResponse(resultsByTime: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ ResultsByTime: resultsByTime }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

function makeDayTotal(
  start: string,
  end: string,
  amount: string,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: amount, Unit: unit } },
  };
}

function makeDayWithGroups(
  start: string,
  end: string,
  totalAmount: string,
  groups: Array<{ key: string; amount: string }>,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: totalAmount, Unit: unit } },
    Groups: groups.map((g) => ({
      Keys: [g.key],
      Metrics: { [metric]: { Amount: g.amount, Unit: unit } },
    })),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  awsClientConstructors.length = 0;
});

describe("getCostSummary", () => {
  it("returns normalized summary for a single time period", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-01-02", "42.50")]),
    );

    const result = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-01-02", granularity: "DAILY" },
      credentials,
    );

    expect(result).toEqual({
      period: { startDate: "2025-01-01", endDate: "2025-01-02" },
      currency: "USD",
      total: 42.5,
    });
  });

  it("aggregates totals across multiple time periods", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayTotal("2025-01-01", "2025-01-02", "10.00"),
        makeDayTotal("2025-01-02", "2025-01-03", "20.00"),
        makeDayTotal("2025-01-03", "2025-01-04", "30.00"),
      ]),
    );

    const result = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-01-04", granularity: "DAILY" },
      credentials,
    );

    expect(result.total).toBe(60);
    expect(result.currency).toBe("USD");
  });

  it("defaults to MONTHLY granularity and UnblendedCost metric", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    const result = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    expect(result.total).toBe(100);
    expect(result.currency).toBe("USD");
  });

  it("respects custom metric option", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayTotal("2025-01-01", "2025-02-01", "50.00", "USD", "AmortizedCost"),
      ]),
    );

    const result = await getCostSummary(
      {
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        metric: "AmortizedCost",
      },
      credentials,
    );

    expect(result.total).toBe(50);
  });

  it("rejects unsupported metrics before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const err = await getCostSummary(
      {
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        metric: "BlendedCost" as never,
      },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "unsupported_metric" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported granularity before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    const err = await getCostSummary(
      {
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "HOURLY" as never,
      },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "unsupported_granularity" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws ValidationError for invalid date format", async () => {
    await expect(
      getCostSummary(
        { startDate: "01-01-2025", endDate: "2025-02-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects invalid calendar dates like 2025-02-30 (Feb 30 does not exist)", async () => {
    await expect(
      getCostSummary(
        { startDate: "2025-02-30", endDate: "2025-03-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when startDate >= endDate", async () => {
    await expect(
      getCostSummary(
        { startDate: "2025-02-01", endDate: "2025-01-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when date range exceeds 90 days", async () => {
    await expect(
      getCostSummary(
        { startDate: "2025-01-01", endDate: "2025-05-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("does not call AWS when date validation fails", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "100.00")]),
    );

    await expect(
      getCostSummary(
        { startDate: "invalid", endDate: "2025-02-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses us-east-1 as the default Cost Explorer signing region", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    expect(awsClientConstructors[0]).toEqual(
      expect.objectContaining({
        service: "ce",
        region: "us-east-1",
      }),
    );
  });

  it("accepts explicit signing region override", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
      "eu-west-1",
    );

    expect(awsClientConstructors[0]).toEqual(
      expect.objectContaining({
        service: "ce",
        region: "eu-west-1",
      }),
    );
  });

  it("does not leak credentials in error payloads", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const err = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    ).catch((e) => e);

    const errStr = JSON.stringify(err);
    expect(errStr).not.toContain("AKIA");
    expect(errStr).not.toContain("test-secret");
  });

  it("handles empty ResultsByTime", async () => {
    mockFetch.mockResolvedValue(ceResponse([]));

    const result = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    expect(result.total).toBe(0);
    expect(result.currency).toBe("USD");
  });

  it("sends X-Amz-Target header", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2025-02-01", "10.00")]),
    );

    await getCostSummary(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers["X-Amz-Target"]).toBe(
      "AWSInsightsIndexService.GetCostAndUsage",
    );
    expect(calledInit.headers["Content-Type"]).toBe(
      "application/x-amz-json-1.1",
    );
  });

  it("rejects future startDate before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2030-01-01", "2030-02-01", "10.00")]),
    );

    const err = await getCostSummary(
      { startDate: "2030-01-01", endDate: "2030-02-01" },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "future_date" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects future endDate before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayTotal("2025-01-01", "2030-02-01", "10.00")]),
    );

    const err = await getCostSummary(
      { startDate: "2025-01-01", endDate: "2030-02-01" },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "future_date" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("getCostByService", () => {
  it("returns normalized breakdown with services", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "150.00", [
          { key: "Amazon EC2", amount: "100.00" },
          { key: "Amazon S3", amount: "50.00" },
        ]),
      ]),
    );

    const result = await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    expect(result.period).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    });
    expect(result.currency).toBe("USD");
    expect(result.total).toBe(150);
    expect(result.services).toHaveLength(2);
    expect(result.services[0]).toEqual({
      service: "Amazon EC2",
      amount: 100,
    });
    expect(result.services[1]).toEqual({
      service: "Amazon S3",
      amount: 50,
    });
  });

  it("rejects unsupported metrics before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayWithGroups("2025-01-01", "2025-02-01", "10.00", [])]),
    );

    const err = await getCostByService(
      {
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        metric: "BlendedCost" as never,
      },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "unsupported_metric" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects unsupported granularity before AWS call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayWithGroups("2025-01-01", "2025-02-01", "10.00", [])]),
    );

    const err = await getCostByService(
      {
        startDate: "2025-01-01",
        endDate: "2025-02-01",
        granularity: "HOURLY" as never,
      },
      credentials,
    ).catch((e) => e);

    expect(err).toMatchObject({ code: "unsupported_granularity" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("aggregates service costs across multiple time periods", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-01-02", "60.00", [
          { key: "Amazon EC2", amount: "40.00" },
          { key: "Amazon S3", amount: "20.00" },
        ]),
        makeDayWithGroups("2025-01-02", "2025-01-03", "90.00", [
          { key: "Amazon EC2", amount: "60.00" },
          { key: "Amazon S3", amount: "30.00" },
        ]),
      ]),
    );

    const result = await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-01-03", granularity: "DAILY" },
      credentials,
    );

    expect(result.total).toBe(150);
    expect(result.services).toHaveLength(2);
    expect(result.services).toContainEqual({
      service: "Amazon EC2",
      amount: 100,
    });
    expect(result.services).toContainEqual({
      service: "Amazon S3",
      amount: 50,
    });
  });

  it("sorts services by amount descending", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        makeDayWithGroups("2025-01-01", "2025-02-01", "200.00", [
          { key: "Amazon S3", amount: "50.00" },
          { key: "Amazon EC2", amount: "100.00" },
          { key: "AWS Lambda", amount: "50.00" },
        ]),
      ]),
    );

    const result = await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    const amounts = result.services.map((s) => s.amount);
    expect(amounts).toEqual([100, 50, 50]);
  });

  it("handles empty groups", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([
        {
          TimePeriod: { Start: "2025-01-01", End: "2025-02-01" },
          Total: { UnblendedCost: { Amount: "0.00", Unit: "USD" } },
          Groups: [],
        },
      ]),
    );

    const result = await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    expect(result.total).toBe(0);
    expect(result.services).toEqual([]);
  });

  it("throws ValidationError for invalid dates before API call", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayWithGroups("2025-01-01", "2025-02-01", "10.00", [])]),
    );

    await expect(
      getCostByService(
        { startDate: "invalid", endDate: "2025-02-01" },
        credentials,
      ),
    ).rejects.toThrow(ValidationError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends SERVICE GroupBy in the request body", async () => {
    mockFetch.mockResolvedValue(
      ceResponse([makeDayWithGroups("2025-01-01", "2025-02-01", "10.00", [])]),
    );

    await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    );

    const calledInit = mockFetch.mock.calls[0][1];
    const body = JSON.parse(calledInit.body);
    expect(body.GroupBy).toEqual([
      { Type: "DIMENSION", Key: "SERVICE" },
    ]);
  });

  it("does not leak credentials in error payloads", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const err = await getCostByService(
      { startDate: "2025-01-01", endDate: "2025-02-01" },
      credentials,
    ).catch((e) => e);

    const errStr = JSON.stringify(err);
    expect(errStr).not.toContain("AKIA");
    expect(errStr).not.toContain("test-secret");
  });
});
