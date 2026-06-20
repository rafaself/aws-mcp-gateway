import { describe, it, expect } from "vitest";
import { buildCacheKey } from "./keys.js";

const SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";

describe("buildCacheKey", () => {
  it("returns deterministic keys for identical inputs", async () => {
    const params = {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      metric: "UnblendedCost",
    };

    const key1 = await buildCacheKey("get_aws_cost_summary", params);
    const key2 = await buildCacheKey("get_aws_cost_summary", params);

    expect(key1).toBe(key2);
  });

  it("returns different keys for different tool names", async () => {
    const params = {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    };

    const key1 = await buildCacheKey("get_aws_cost_summary", params);
    const key2 = await buildCacheKey("get_aws_cost_by_service", params);

    expect(key1).not.toBe(key2);
  });

  it("returns different keys for different date ranges", async () => {
    const key1 = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    const key2 = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-02-01",
      endDate: "2025-03-01",
      granularity: "MONTHLY",
    });

    expect(key1).not.toBe(key2);
  });

  it("returns deterministic result regardless of param ordering", async () => {
    const key1 = await buildCacheKey("test_tool", {
      a: "1",
      b: "2",
      c: "3",
    });

    const key2 = await buildCacheKey("test_tool", {
      c: "3",
      a: "1",
      b: "2",
    });

    expect(key1).toBe(key2);
  });

  it("produces a key prefixed with ce:", async () => {
    const key = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    });

    expect(key).toMatch(/^ce:[a-f0-9]{64}$/);
  });

  it("does not include credentials in the cache key", async () => {
    const key = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    });

    expect(key).not.toContain(ACCESS_KEY_ID);
    expect(key).not.toContain(SECRET_ACCESS_KEY);
    expect(key).not.toContain("AKIA");
    expect(key).not.toContain("secret");
  });

  it("does not include bearer tokens in the cache key", async () => {
    const key = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    });

    expect(key).not.toContain("Bearer");
    expect(key).not.toContain("token");
    expect(key).not.toContain("auth");
  });
});
