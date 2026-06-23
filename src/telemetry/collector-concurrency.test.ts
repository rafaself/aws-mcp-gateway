import { describe, expect, it } from "vitest";
import { createExecutionCollector } from "./collector.js";

describe("ExecutionCollector concurrency", () => {
  it("does not share telemetry between parallel collector instances", async () => {
    const collectors = Array.from({ length: 4 }, () => createExecutionCollector());

    await Promise.all(
      collectors.map(async (collector, index) => {
        collector.recordCacheStatus(index % 2 === 0 ? "hit" : "miss");
        collector.recordAwsRequest("ce:GetCostAndUsage", "us-east-1");
        if (index % 2 === 1) {
          collector.recordAwsRequest("ce:GetCostAndUsage", "us-east-1");
        }
      }),
    );

    expect(collectors[0].snapshot().awsRequests[0]?.requestCount).toBe(1);
    expect(collectors[1].snapshot().awsRequests[0]?.requestCount).toBe(2);
    expect(collectors[0].resolveCacheStatus()).toBe("hit");
    expect(collectors[1].resolveCacheStatus()).toBe("miss");
  });
});
