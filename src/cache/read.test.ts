import { describe, expect, it, vi } from "vitest";
import { createExecutionCollector } from "../telemetry/collector.js";
import { cacheReadWithStatus } from "./read.js";

function createMockKv(): {
  get: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
  };
}

describe("cacheReadWithStatus", () => {
  it("returns disabled when kv is absent", async () => {
    const collector = createExecutionCollector();
    const result = await cacheReadWithStatus(undefined, "key", collector);

    expect(result).toEqual({ value: null, status: "disabled" });
    expect(collector.resolveCacheStatus()).toBe("disabled");
  });

  it("returns hit when kv has a value", async () => {
    const kv = createMockKv();
    kv.get.mockResolvedValue({ total: 42 });
    const collector = createExecutionCollector();

    const result = await cacheReadWithStatus(kv as never, "key", collector);

    expect(result).toEqual({ value: { total: 42 }, status: "hit" });
    expect(collector.resolveCacheStatus()).toBe("hit");
  });

  it("returns miss when kv has no value", async () => {
    const kv = createMockKv();
    kv.get.mockResolvedValue(null);
    const collector = createExecutionCollector();

    const result = await cacheReadWithStatus(kv as never, "key", collector);

    expect(result).toEqual({ value: null, status: "miss" });
    expect(collector.resolveCacheStatus()).toBe("miss");
  });

  it("returns unavailable when kv read throws", async () => {
    const kv = createMockKv();
    kv.get.mockRejectedValue(new Error("KV unavailable"));
    const collector = createExecutionCollector();

    const result = await cacheReadWithStatus(kv as never, "key", collector);

    expect(result).toEqual({ value: null, status: "unavailable" });
    expect(collector.resolveCacheStatus()).toBe("unavailable");
  });
});
