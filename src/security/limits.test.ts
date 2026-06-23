import { describe, it, expect } from "vitest";
import {
  COST_MAX_DATE_RANGE_DAYS,
  COST_MAX_SERVICE_ROWS,
  CW_ALARM_PREFIX_MAX_LENGTH,
  CW_MAX_ALARMS,
  LOGS_DEFAULT_LOOKBACK_MINUTES,
  LOGS_MAX_EVENTS,
  LOGS_MAX_FILTER_PATTERN_LENGTH,
  LOGS_MAX_HOURS,
  LOGS_MAX_LOOKBACK_MINUTES,
  LOGS_MAX_MESSAGE_LENGTH,
  LOG_STREAM_PREFIX_MAX_LENGTH,
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

  it("LOGS_MAX_LOOKBACK_MINUTES is 1440", () => {
    expect(LOGS_MAX_LOOKBACK_MINUTES).toBe(1_440);
  });

  it("LOGS_DEFAULT_LOOKBACK_MINUTES is 30", () => {
    expect(LOGS_DEFAULT_LOOKBACK_MINUTES).toBe(30);
  });

  it("LOGS_MAX_FILTER_PATTERN_LENGTH is 256", () => {
    expect(LOGS_MAX_FILTER_PATTERN_LENGTH).toBe(256);
  });

  it("LOG_STREAM_PREFIX_MAX_LENGTH is 512", () => {
    expect(LOG_STREAM_PREFIX_MAX_LENGTH).toBe(512);
  });

  it("CW_MAX_ALARMS is 100", () => {
    expect(CW_MAX_ALARMS).toBe(100);
  });

  it("CW_ALARM_PREFIX_MAX_LENGTH is 256", () => {
    expect(CW_ALARM_PREFIX_MAX_LENGTH).toBe(256);
  });
});
