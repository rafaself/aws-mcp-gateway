import { describe, expect, it } from "vitest";
import {
  parseToolExecutionMetadata,
  toolExecutionBillingSchema,
  toolExecutionCacheSchema,
  toolExecutionMetadataSchema,
} from "./metadata.js";

const validMetadata = {
  cache: { enabled: true, status: "miss" as const, ttlSeconds: 1800 },
  billing: {
    provider: "aws" as const,
    costClass: "paid" as const,
    estimatedCostUsd: 0.01,
    currency: "USD" as const,
    charged: true,
    pricingModel: "per-request" as const,
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

describe("toolExecutionMetadataSchema", () => {
  it("parses a valid execution metadata object", () => {
    expect(parseToolExecutionMetadata(validMetadata)).toEqual(validMetadata);
    expect(toolExecutionMetadataSchema.safeParse(validMetadata).success).toBe(true);
  });

  it("rejects missing required billing fields", () => {
    const incomplete = {
      ...validMetadata,
      billing: {
        provider: "aws",
        costClass: "paid",
      },
    };

    expect(toolExecutionMetadataSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects negative estimatedCostUsd", () => {
    const invalid = {
      ...validMetadata,
      billing: { ...validMetadata.billing, estimatedCostUsd: -1 },
    };

    expect(toolExecutionMetadataSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects negative awsRequestCount", () => {
    const invalid = { ...validMetadata, awsRequestCount: -1 };

    expect(toolExecutionMetadataSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("toolExecutionCacheSchema", () => {
  it("accepts all supported cache statuses", () => {
    for (const status of ["hit", "miss", "disabled", "unavailable", "bypass"] as const) {
      expect(
        toolExecutionCacheSchema.safeParse({ enabled: true, status }).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported cache statuses", () => {
    expect(
      toolExecutionCacheSchema.safeParse({ enabled: true, status: "stale" }).success,
    ).toBe(false);
  });
});

describe("toolExecutionBillingSchema", () => {
  it("accepts all supported cost classes", () => {
    for (const costClass of [
      "free",
      "low",
      "paid",
      "fanout-sensitive",
      "volume-sensitive",
    ] as const) {
      expect(
        toolExecutionBillingSchema.safeParse({
          provider: "aws",
          costClass,
          estimatedCostUsd: 0,
          currency: "USD",
          charged: false,
          pricingModel: "none",
          note: "test",
        }).success,
      ).toBe(true);
    }
  });

  it("rejects unsupported cost classes", () => {
    expect(
      toolExecutionBillingSchema.safeParse({
        provider: "aws",
        costClass: "premium",
        estimatedCostUsd: 0,
        currency: "USD",
        charged: false,
        pricingModel: "none",
        note: "test",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported pricing models", () => {
    expect(
      toolExecutionBillingSchema.safeParse({
        provider: "aws",
        costClass: "paid",
        estimatedCostUsd: 0,
        currency: "USD",
        charged: false,
        pricingModel: "per-gigabyte",
        note: "test",
      }).success,
    ).toBe(false);
  });
});
