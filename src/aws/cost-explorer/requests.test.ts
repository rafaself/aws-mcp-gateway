import { describe, it, expect } from "vitest";
import { buildRequest, validateGranularity, validateMetric } from "./requests.js";
import { CostExplorerError } from "./types.js";

describe("buildRequest", () => {
  it("builds request body with time period, granularity, and metrics", () => {
    const body = buildRequest("2025-01-01", "2025-02-01", "MONTHLY", "UnblendedCost");

    expect(body).toEqual({
      TimePeriod: { Start: "2025-01-01", End: "2025-02-01" },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
    });
  });

  it("includes GroupBy when provided", () => {
    const body = buildRequest("2025-01-01", "2025-02-01", "MONTHLY", "UnblendedCost", [
      { Type: "DIMENSION", Key: "SERVICE" },
    ]);

    expect(body.GroupBy).toEqual([{ Type: "DIMENSION", Key: "SERVICE" }]);
  });

  it("omits GroupBy when empty array", () => {
    const body = buildRequest("2025-01-01", "2025-02-01", "MONTHLY", "UnblendedCost", []);

    expect(body).not.toHaveProperty("GroupBy");
  });
});

describe("validateGranularity", () => {
  it("accepts DAILY", () => {
    expect(() => validateGranularity("DAILY")).not.toThrow();
  });

  it("accepts MONTHLY", () => {
    expect(() => validateGranularity("MONTHLY")).not.toThrow();
  });

  it("rejects HOURLY", () => {
    expect(() => validateGranularity("HOURLY")).toThrow(CostExplorerError);
  });

  it("rejects random strings", () => {
    expect(() => validateGranularity("YEARLY")).toThrow(CostExplorerError);
  });

  it("throws with unsupported_granularity code", () => {
    try {
      validateGranularity("HOURLY");
    } catch (e) {
      expect(e).toMatchObject({ code: "unsupported_granularity" });
    }
  });
});

describe("validateMetric", () => {
  it("accepts UnblendedCost", () => {
    expect(() => validateMetric("UnblendedCost")).not.toThrow();
  });

  it("accepts AmortizedCost", () => {
    expect(() => validateMetric("AmortizedCost")).not.toThrow();
  });

  it("rejects BlendedCost", () => {
    expect(() => validateMetric("BlendedCost")).toThrow(CostExplorerError);
  });

  it("throws with unsupported_metric code", () => {
    try {
      validateMetric("BlendedCost");
    } catch (e) {
      expect(e).toMatchObject({ code: "unsupported_metric" });
    }
  });
});
