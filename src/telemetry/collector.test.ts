import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import { createCostSummaryToolManifest } from "../mcp/tools/definitions/cost-summary.js";
import { createListEc2InstancesToolManifest } from "../mcp/tools/definitions/list-ec2-instances.js";
import type { AnyToolManifest } from "../mcp/tools/manifest.js";
import { buildRuntimeFactsFromSnapshot } from "../mcp/execution/runtime-facts.js";
import { createExecutionCollector } from "./collector.js";

describe("ExecutionCollector", () => {
  it("reset clears cache and AWS request state", () => {
    const collector = createExecutionCollector();
    collector.recordCacheStatus("hit");
    collector.recordAwsRequest("ce:GetCostAndUsage", "us-east-1");

    collector.reset();

    expect(collector.resolveCacheStatus()).toBeUndefined();
    const ctx = createTestGatewayContext();
    const manifest = createCostSummaryToolManifest(ctx) as AnyToolManifest;
    const facts = buildRuntimeFactsFromSnapshot(manifest, collector.snapshot());
    expect(facts.awsRequests?.every((r) => r.requestCount === 0)).toBe(true);
  });

  it("isolates state between separate collectors", () => {
    const a = createExecutionCollector();
    const b = createExecutionCollector();

    a.recordCacheStatus("miss");
    a.recordAwsRequest("ce:GetCostAndUsage", "us-east-1");

    expect(b.resolveCacheStatus()).toBeUndefined();
    expect(
      buildRuntimeFactsFromSnapshot(
        createCostSummaryToolManifest(createTestGatewayContext()) as AnyToolManifest,
        b.snapshot(),
      ).awsRequests?.[0]?.requestCount,
    ).toBe(0);
  });

  it("aggregates cache status with miss taking priority over hit", () => {
    const collector = createExecutionCollector();
    collector.recordCacheStatus("hit");
    collector.recordCacheStatus("miss");

    expect(collector.resolveCacheStatus()).toBe("miss");
  });

  it("aggregates unavailable above hit", () => {
    const collector = createExecutionCollector();
    collector.recordCacheStatus("hit");
    collector.recordCacheStatus("unavailable");

    expect(collector.resolveCacheStatus()).toBe("unavailable");
  });

  it("records AWS requests merged into manifest capability summaries", () => {
    const collector = createExecutionCollector();
    const ctx = createTestGatewayContext();
    const manifest = createCostSummaryToolManifest(ctx) as AnyToolManifest;

    collector.recordAwsRequest("ce:GetCostAndUsage", "us-east-1");

    const facts = buildRuntimeFactsFromSnapshot(manifest, collector.snapshot());
    expect(facts.awsRequests).toEqual([
      expect.objectContaining({
        service: "ce",
        action: "ce:GetCostAndUsage",
        region: "us-east-1",
        requestCount: 1,
        estimatedUnitCostUsd: 0.01,
      }),
    ]);
  });

  it("sums fanout requests for the same capability across regions", () => {
    const collector = createExecutionCollector();
    const ctx = createTestGatewayContext();
    const manifest = createListEc2InstancesToolManifest(ctx) as AnyToolManifest;

    collector.recordAwsRequest("ec2:DescribeInstances", "us-east-1");
    collector.recordAwsRequest("ec2:DescribeInstances", "us-west-2");

    const facts = buildRuntimeFactsFromSnapshot(manifest, collector.snapshot());
    const ec2Summary = facts.awsRequests?.find((r) => r.action === "ec2:DescribeInstances");
    expect(ec2Summary?.requestCount).toBe(2);
  });

  it("includes cache status in runtime facts", () => {
    const collector = createExecutionCollector();
    collector.recordCacheStatus("hit");

    const facts = buildRuntimeFactsFromSnapshot(
      createCostSummaryToolManifest(createTestGatewayContext()) as AnyToolManifest,
      collector.snapshot(),
    );
    expect(facts.cacheStatus).toBe("hit");
  });
});
