import { describe, expect, it } from "vitest";
import { attachExecutionMetadata } from "./attach.js";
import type { ToolExecutionMetadata } from "./metadata.js";

const execution: ToolExecutionMetadata = {
  cache: { enabled: true, status: "miss", ttlSeconds: 1800 },
  billing: {
    provider: "aws",
    costClass: "paid",
    estimatedCostUsd: 0.01,
    currency: "USD",
    charged: true,
    pricingModel: "per-request",
    note: "Estimated AWS Cost Explorer API charge for a non-cached request. Final billing is determined by AWS.",
  },
  awsRequests: [
    {
      service: "ce",
      action: "ce:GetCostAndUsage",
      region: "us-east-1",
      requestCount: 1,
      estimatedUnitCostUsd: 0.01,
    },
  ],
  awsRequestCount: 1,
};

describe("attachExecutionMetadata", () => {
  it("preserves existing cost summary domain fields", () => {
    const domain = {
      period: { startDate: "2026-06-01", endDate: "2026-06-23" },
      granularity: "MONTHLY" as const,
      total: 12.34,
      currency: "USD",
    };

    const result = attachExecutionMetadata(domain, execution);

    expect(result.period).toEqual(domain.period);
    expect(result.granularity).toBe("MONTHLY");
    expect(result.total).toBe(12.34);
    expect(result.currency).toBe("USD");
    expect(result.execution).toEqual(execution);
  });

  it("preserves existing inventory domain fields", () => {
    const domain = {
      regions: ["us-east-1"],
      count: 1,
      instances: [
        {
          instanceId: "i-123",
          region: "us-east-1",
          state: "running",
          instanceType: "t3.micro",
          name: "web",
        },
      ],
    };

    const result = attachExecutionMetadata(domain, execution);

    expect(result.regions).toEqual(["us-east-1"]);
    expect(result.count).toBe(1);
    expect(result.instances).toEqual(domain.instances);
    expect(result.execution).toEqual(execution);
  });

  it("rejects invalid execution metadata", () => {
    const domain = { total: 1, currency: "USD" };

    expect(() =>
      attachExecutionMetadata(domain, {
        ...execution,
        billing: {
          ...execution.billing,
          pricingModel: "per-gigabyte" as "per-request",
        },
      }),
    ).toThrow();
  });
});
