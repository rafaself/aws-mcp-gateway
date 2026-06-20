import { describe, it, expect } from "vitest";
import {
  COST_MAX_DATE_RANGE_DAYS,
  COST_MAX_SERVICE_ROWS,
  LOGS_MAX_HOURS,
  LOGS_MAX_EVENTS,
  LOGS_MAX_MESSAGE_LENGTH,
} from "./limits.js";

describe("safety limits constants", () => {
  it("COST_MAX_DATE_RANGE_DAYS is 90", () => {
    expect(COST_MAX_DATE_RANGE_DAYS).toBe(90);
  });

  it("COST_MAX_SERVICE_ROWS is 25", () => {
    expect(COST_MAX_SERVICE_ROWS).toBe(25);
  });

  it("LOGS_MAX_HOURS is 24", () => {
    expect(LOGS_MAX_HOURS).toBe(24);
  });

  it("LOGS_MAX_EVENTS is 50", () => {
    expect(LOGS_MAX_EVENTS).toBe(50);
  });

  it("LOGS_MAX_MESSAGE_LENGTH is 1000", () => {
    expect(LOGS_MAX_MESSAGE_LENGTH).toBe(1_000);
  });
});
