import { describe, it, expect } from "vitest";
import { parseAmount, getMetric } from "./parse.js";

describe("parseAmount", () => {
  it("parses amount and unit", () => {
    const result = parseAmount({ Amount: "42.50", Unit: "USD" }, "USD");
    expect(result).toEqual({ value: 42.5, currency: "USD" });
  });

  it("returns 0 when amount is undefined", () => {
    const result = parseAmount(undefined, "USD");
    expect(result).toEqual({ value: 0, currency: "USD" });
  });

  it("falls back to provided currency when Unit is missing", () => {
    const result = parseAmount({ Amount: "10.00" }, "EUR");
    expect(result).toEqual({ value: 10, currency: "EUR" });
  });

  it("returns 0 when Amount is empty string", () => {
    const result = parseAmount({ Amount: "", Unit: "USD" }, "USD");
    expect(result).toEqual({ value: 0, currency: "USD" });
  });
});

describe("getMetric", () => {
  it("returns the metric amount from totals", () => {
    const totals = {
      UnblendedCost: { Amount: "100.00", Unit: "USD" },
    };
    const result = getMetric(totals, "UnblendedCost");
    expect(result).toEqual({ Amount: "100.00", Unit: "USD" });
  });

  it("returns undefined when totals is undefined", () => {
    expect(getMetric(undefined, "UnblendedCost")).toBeUndefined();
  });

  it("returns undefined when metric not in totals", () => {
    const totals = {
      UnblendedCost: { Amount: "100.00", Unit: "USD" },
    };
    expect(getMetric(totals, "AmortizedCost")).toBeUndefined();
  });
});
