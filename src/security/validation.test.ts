import { describe, it, expect } from "vitest";
import { parseIsoDate, validateCostDates } from "./validation.js";
import { ValidationError } from "./errors.js";

describe("parseIsoDate", () => {
  it("parses a valid YYYY-MM-DD date", () => {
    const date = parseIsoDate("2025-01-01");
    expect(date).toBeInstanceOf(Date);
    expect(date.getUTCFullYear()).toBe(2025);
    expect(date.getUTCMonth()).toBe(0);
    expect(date.getUTCDate()).toBe(1);
  });

  it("throws ValidationError for invalid format", () => {
    expect(() => parseIsoDate("01-01-2025")).toThrow(ValidationError);
  });

  it("throws with invalid_date_format code", () => {
    try {
      parseIsoDate("01/01/2025");
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid_date_format" });
    }
  });

  it("throws ValidationError for invalid calendar date (Feb 30)", () => {
    expect(() => parseIsoDate("2025-02-30")).toThrow(ValidationError);
  });

  it("throws with invalid_date code for non-existent date", () => {
    try {
      parseIsoDate("2025-02-30");
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid_date" });
    }
  });

  it("rejects nonsense input", () => {
    expect(() => parseIsoDate("not-a-date")).toThrow(ValidationError);
  });
});

describe("validateCostDates", () => {
  it("passes for valid past date range", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2025-02-01"),
    ).not.toThrow();
  });

  it("passes for exact 90-day range", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2025-04-01"),
    ).not.toThrow();
  });

  it("throws ValidationError for inverted dates", () => {
    expect(() =>
      validateCostDates("2025-02-01", "2025-01-01"),
    ).toThrow(ValidationError);
  });

  it("throws with invalid_date_range code for inverted dates", () => {
    try {
      validateCostDates("2025-02-01", "2025-01-01");
    } catch (e) {
      expect(e).toMatchObject({ code: "invalid_date_range" });
    }
  });

  it("throws ValidationError when range exceeds 90 days", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2025-05-01"),
    ).toThrow(ValidationError);
  });

  it("throws with date_range_exceeded code for long range", () => {
    try {
      validateCostDates("2025-01-01", "2025-05-01");
    } catch (e) {
      expect(e).toMatchObject({ code: "date_range_exceeded" });
    }
  });

  it("throws ValidationError for future startDate", () => {
    expect(() =>
      validateCostDates("2030-01-01", "2030-02-01"),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for future endDate", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2030-02-01"),
    ).toThrow(ValidationError);
  });

  it("throws with future_date code for future dates", () => {
    try {
      validateCostDates("2030-01-01", "2030-02-01");
    } catch (e) {
      expect(e).toMatchObject({ code: "future_date" });
    }
  });

  it("throws ValidationError for invalid date format", () => {
    expect(() =>
      validateCostDates("invalid", "2025-02-01"),
    ).toThrow(ValidationError);
  });

  it("throws ValidationError for invalid calendar date", () => {
    expect(() =>
      validateCostDates("2025-02-30", "2025-03-01"),
    ).toThrow(ValidationError);
  });

  it("respects custom maxDays parameter", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2025-01-15", 7),
    ).toThrow(ValidationError);
  });

  it("passes when custom maxDays is not exceeded", () => {
    expect(() =>
      validateCostDates("2025-01-01", "2025-01-05", 7),
    ).not.toThrow();
  });
});
