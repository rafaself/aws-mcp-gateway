import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { createCostSummaryToolManifest } from "../tools/definitions/cost-summary.js";
import { createListEc2InstancesToolManifest } from "../tools/definitions/list-ec2-instances.js";
import { createStatusToolManifest } from "../tools/definitions/status.js";
import type { AnyToolManifest } from "../tools/manifest.js";
import {
  getCapabilityUnitCostUsd,
  paidManifestHasModeledUnitCosts,
  resolveBillingFromManifest,
  resolveBillingNote,
  resolveDefaultCacheBlock,
  resolvePricingModel,
} from "./pricing.js";

const testContext = createTestGatewayContext();

describe("resolvePricingModel", () => {
  it("maps paid tools to per-request pricing", () => {
    expect(resolvePricingModel("paid")).toBe("per-request");
  });

  it("maps fanout-sensitive tools to usage-dependent pricing", () => {
    expect(resolvePricingModel("fanout-sensitive")).toBe("usage-dependent");
  });

  it("maps volume-sensitive tools to usage-dependent pricing", () => {
    expect(resolvePricingModel("volume-sensitive")).toBe("usage-dependent");
  });

  it("maps free and low tools to none pricing", () => {
    expect(resolvePricingModel("free")).toBe("none");
    expect(resolvePricingModel("low")).toBe("none");
  });
});

describe("getCapabilityUnitCostUsd", () => {
  it("returns a fixed unit cost only for Cost Explorer", () => {
    expect(getCapabilityUnitCostUsd("ce:GetCostAndUsage")).toBe(0.01);
    expect(getCapabilityUnitCostUsd("ec2:DescribeInstances")).toBeUndefined();
  });
});

describe("resolveBillingNote", () => {
  it("returns cache-hit note for paid tools served from cache", () => {
    expect(resolveBillingNote("paid", { cacheStatus: "hit", charged: false })).toContain(
      "No new AWS Cost Explorer API request was made",
    );
  });

  it("returns non-cached estimate disclaimer for paid cache miss", () => {
    expect(resolveBillingNote("paid", { cacheStatus: "miss", charged: true })).toContain(
      "Estimated AWS Cost Explorer API charge for a non-cached request",
    );
  });

  it("uses usage-dependent disclaimer for fanout-sensitive tools", () => {
    expect(resolveBillingNote("fanout-sensitive")).toContain(
      "No fixed per-request AWS API charge is estimated",
    );
  });
});

describe("paidManifestHasModeledUnitCosts", () => {
  it("requires unit costs for every capability on paid manifests", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    expect(paidManifestHasModeledUnitCosts(manifest)).toBe(true);
  });

  it("does not require unit costs for non-paid manifests", () => {
    const manifest = createListEc2InstancesToolManifest(testContext) as AnyToolManifest;
    expect(paidManifestHasModeledUnitCosts(manifest)).toBe(true);
  });
});

describe("resolveBillingFromManifest", () => {
  it("defaults charged to false and estimatedCostUsd to zero", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    const billing = resolveBillingFromManifest(manifest);

    expect(billing).toMatchObject({
      provider: "aws",
      costClass: "paid",
      estimatedCostUsd: 0,
      currency: "USD",
      charged: false,
      pricingModel: "per-request",
    });
    expect(billing.note).toContain("Final billing is determined by AWS");
  });
});

describe("resolveDefaultCacheBlock", () => {
  it("marks cache unavailable when enabled but no runtime status is provided", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;

    expect(resolveDefaultCacheBlock(manifest)).toEqual({
      enabled: true,
      status: "unavailable",
      ttlSeconds: manifest.safety.cacheTtlSeconds,
    });
  });

  it("marks cache disabled for non-cached tools", () => {
    const manifest = createStatusToolManifest(testContext) as AnyToolManifest;

    expect(resolveDefaultCacheBlock(manifest)).toEqual({
      enabled: false,
      status: "disabled",
    });
  });

  it("uses the provided cache status when runtime facts are available", () => {
    const manifest = createListEc2InstancesToolManifest(testContext) as AnyToolManifest;

    expect(resolveDefaultCacheBlock(manifest, "hit")).toEqual({
      enabled: true,
      status: "hit",
      ttlSeconds: manifest.safety.cacheTtlSeconds,
    });
  });
});
