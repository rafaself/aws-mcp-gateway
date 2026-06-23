import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { GatewayError } from "../../errors/public-error.js";
import { createCostSummaryToolManifest } from "../tools/definitions/cost-summary.js";
import { createListEc2InstancesToolManifest } from "../tools/definitions/list-ec2-instances.js";
import { createListLogGroupsToolManifest } from "../tools/definitions/list-log-groups.js";
import { createStatusToolManifest } from "../tools/definitions/status.js";
import type { AnyToolManifest } from "../tools/manifest.js";
import { buildAwsExecutionMetadataFromManifest } from "./build.js";

const testContext = createTestGatewayContext();

describe("buildAwsExecutionMetadataFromManifest", () => {
  it("builds paid Cost Explorer metadata with per-request billing defaults", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    const metadata = buildAwsExecutionMetadataFromManifest(manifest);

    expect(metadata.billing).toMatchObject({
      costClass: "paid",
      pricingModel: "per-request",
      estimatedCostUsd: 0,
      charged: false,
    });
    expect(metadata.awsRequests).toEqual([
      {
        service: "ce",
        action: "ce:GetCostAndUsage",
        requestCount: 0,
        estimatedUnitCostUsd: 0.01,
      },
    ]);
    expect(metadata.awsRequestCount).toBe(0);
    expect(metadata.cache).toMatchObject({
      enabled: true,
      status: "unavailable",
      ttlSeconds: 1800,
    });
  });

  it("builds fanout-sensitive metadata with usage-dependent billing", () => {
    const manifest = createListEc2InstancesToolManifest(testContext) as AnyToolManifest;
    const metadata = buildAwsExecutionMetadataFromManifest(manifest);

    expect(metadata.billing).toMatchObject({
      costClass: "fanout-sensitive",
      pricingModel: "usage-dependent",
      estimatedCostUsd: 0,
      charged: false,
    });
    expect(metadata.awsRequests[0]).toMatchObject({
      service: "ec2",
      action: "ec2:DescribeInstances",
      requestCount: 0,
    });
    expect(metadata.awsRequests[0]).not.toHaveProperty("estimatedUnitCostUsd");
  });

  it("builds volume-sensitive metadata with usage-dependent billing", () => {
    const manifest = createListLogGroupsToolManifest(testContext) as AnyToolManifest;
    const metadata = buildAwsExecutionMetadataFromManifest(manifest);

    expect(metadata.billing.costClass).toBe("volume-sensitive");
    expect(metadata.billing.pricingModel).toBe("usage-dependent");
  });

  it("rejects non-AWS manifests", () => {
    const manifest = createStatusToolManifest(testContext) as AnyToolManifest;

    expect(() => buildAwsExecutionMetadataFromManifest(manifest)).toThrow(GatewayError);
    expect(() => buildAwsExecutionMetadataFromManifest(manifest)).toThrow(
      "Execution metadata is not applicable to non-AWS tools.",
    );
  });

  it("accepts runtime cache and AWS request facts", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    const metadata = buildAwsExecutionMetadataFromManifest(manifest, {
      cacheStatus: "miss",
      awsRequests: [
        {
          service: "ce",
          action: "ce:GetCostAndUsage",
          region: "us-east-1",
          requestCount: 1,
          estimatedUnitCostUsd: 0.01,
        },
      ],
    });

    expect(metadata.cache.status).toBe("miss");
    expect(metadata.awsRequestCount).toBe(1);
    expect(metadata.billing).toMatchObject({
      estimatedCostUsd: 0.01,
      charged: true,
    });
  });

  it("does not charge when cache status is hit even with request counts", () => {
    const manifest = createCostSummaryToolManifest(testContext) as AnyToolManifest;
    const metadata = buildAwsExecutionMetadataFromManifest(manifest, {
      cacheStatus: "hit",
      awsRequests: [
        {
          service: "ce",
          action: "ce:GetCostAndUsage",
          requestCount: 1,
          estimatedUnitCostUsd: 0.01,
        },
      ],
    });

    expect(metadata.billing).toMatchObject({
      estimatedCostUsd: 0,
      charged: false,
    });
  });
});
