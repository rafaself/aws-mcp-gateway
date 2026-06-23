import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { createCostSummaryToolManifest } from "../tools/definitions/cost-summary.js";
import { createListEc2InstancesToolManifest } from "../tools/definitions/list-ec2-instances.js";
import type { AnyToolManifest } from "../tools/manifest.js";
import {
  appendVisibleBillingNoteToContent,
  formatVisibleBillingNote,
  shouldAppendVisibleBillingNote,
} from "./billing-content.js";
import type { ToolExecutionMetadata } from "./metadata.js";

const testContext = createTestGatewayContext();

function makeExecution(
  overrides: Partial<ToolExecutionMetadata> & {
    cache?: Partial<ToolExecutionMetadata["cache"]>;
    billing?: Partial<ToolExecutionMetadata["billing"]>;
  } = {},
): ToolExecutionMetadata {
  return {
    cache: {
      enabled: true,
      status: "miss",
      ttlSeconds: 1800,
      ...overrides.cache,
    },
    billing: {
      provider: "aws",
      costClass: "paid",
      estimatedCostUsd: 0.01,
      currency: "USD",
      charged: true,
      pricingModel: "per-request",
      note: "Estimated AWS Cost Explorer API charge for a non-cached request. Final billing is determined by AWS.",
      ...overrides.billing,
    },
    awsRequests: [
      {
        service: "ce",
        action: "ce:GetCostAndUsage",
        requestCount: 1,
        estimatedUnitCostUsd: 0.01,
      },
    ],
    awsRequestCount: 1,
    ...overrides,
  };
}

describe("shouldAppendVisibleBillingNote", () => {
  it("returns true for paid per-request tools", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    expect(shouldAppendVisibleBillingNote(manifest)).toBe(true);
  });

  it("returns false for fanout-sensitive tools", () => {
    const manifest = createListEc2InstancesToolManifest(testContext) as AnyToolManifest;
    expect(shouldAppendVisibleBillingNote(manifest)).toBe(false);
  });
});

describe("formatVisibleBillingNote", () => {
  it("formats cache hit billing note", () => {
    const note = formatVisibleBillingNote(
      makeExecution({
        cache: { enabled: true, status: "hit", ttlSeconds: 1800 },
        billing: {
          provider: "aws",
          costClass: "paid",
          estimatedCostUsd: 0,
          currency: "USD",
          charged: false,
          pricingModel: "per-request",
          note: "No new AWS Cost Explorer API request was made. Final billing is determined by AWS.",
        },
        awsRequestCount: 0,
        awsRequests: [],
      }),
    );

    expect(note).toBe(
      "Billing note: served from cache. No new AWS Cost Explorer API request was made.",
    );
  });

  it("formats cache miss billing note with estimated cost", () => {
    const note = formatVisibleBillingNote(makeExecution());

    expect(note).toBe(
      "Billing note: served from AWS Cost Explorer, not cache. Estimated AWS API cost: US$ 0.01.",
    );
  });

  it("formats multi-request estimated cost", () => {
    const note = formatVisibleBillingNote(
      makeExecution({
        billing: {
          provider: "aws",
          costClass: "paid",
          estimatedCostUsd: 0.02,
          currency: "USD",
          charged: true,
          pricingModel: "per-request",
          note: "Estimated AWS Cost Explorer API charge for a non-cached request. Final billing is determined by AWS.",
        },
      }),
    );

    expect(note).toBe(
      "Billing note: served from AWS Cost Explorer, not cache. Estimated AWS API cost: US$ 0.02.",
    );
  });

  it("returns undefined for disabled cache status", () => {
    const note = formatVisibleBillingNote(
      makeExecution({
        cache: { enabled: false, status: "disabled" },
      }),
    );

    expect(note).toBeUndefined();
  });
});

describe("appendVisibleBillingNoteToContent", () => {
  it("appends billing note to the first text block", () => {
    const content = [{ type: "text", text: "AWS cost from 2025-01-01 to 2025-02-01 is 42.50 USD." }];

    appendVisibleBillingNoteToContent(
      content,
      "Billing note: served from cache. No new AWS Cost Explorer API request was made.",
    );

    expect(content[0].text).toContain("AWS cost from 2025-01-01");
    expect(content[0].text).toContain("Billing note: served from cache.");
  });
});
