import { describe, expect, it } from "vitest";
import {
  summarizeCostDateRangeInput,
  summarizeLogErrorsInput,
  summarizeRegionListInput,
} from "./tool-input.js";

describe("summarizeCostDateRangeInput", () => {
  it("returns a date-range summary without raw dates", () => {
    expect(
      summarizeCostDateRangeInput({
        granularity: "MONTHLY",
      }),
    ).toEqual({
      hasDateRange: true,
      granularity: "MONTHLY",
    });
  });

  it("includes limit when provided", () => {
    expect(
      summarizeCostDateRangeInput({
        granularity: "DAILY",
        limit: 5,
      }),
    ).toEqual({
      hasDateRange: true,
      granularity: "DAILY",
      limit: 5,
    });
  });
});

describe("summarizeRegionListInput", () => {
  it("summarizes explicit regions and state filters", () => {
    expect(
      summarizeRegionListInput({
        regions: ["us-east-1", "us-west-2"],
        states: ["running"],
      }),
    ).toEqual({
      regionCount: 2,
      stateFilter: ["running"],
    });
  });

  it("uses all when regions are omitted", () => {
    expect(summarizeRegionListInput({})).toEqual({
      regionCount: "all",
      stateFilter: undefined,
    });
  });
});

describe("summarizeLogErrorsInput", () => {
  it("returns a log query summary without the log group name", () => {
    expect(
      summarizeLogErrorsInput({
        hours: 24,
        limit: 50,
      }),
    ).toEqual({
      hasLogGroupName: true,
      hours: 24,
      limit: 50,
    });
  });
});
