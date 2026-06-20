import { describe, it, expect } from "vitest";
import {
  parseRegions,
  validateAllowedRegions,
  validateRegion,
  resolveRegions,
} from "./regions.js";
import { ValidationError } from "./errors.js";

describe("parseRegions", () => {
  it("parses comma-separated regions", () => {
    expect(parseRegions("us-east-1,eu-west-1,sa-east-1")).toEqual([
      "us-east-1",
      "eu-west-1",
      "sa-east-1",
    ]);
  });

  it("trims whitespace", () => {
    expect(parseRegions("  us-east-1 , eu-west-1 ")).toEqual([
      "us-east-1",
      "eu-west-1",
    ]);
  });

  it("filters empty entries", () => {
    expect(parseRegions("us-east-1,,eu-west-1")).toEqual([
      "us-east-1",
      "eu-west-1",
    ]);
  });

  it("returns empty array for undefined", () => {
    expect(parseRegions(undefined)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseRegions("")).toEqual([]);
  });
});

describe("validateAllowedRegions", () => {
  it("does not throw for non-empty list", () => {
    expect(() => validateAllowedRegions(["us-east-1"])).not.toThrow();
  });

  it("throws ValidationError for empty list", () => {
    expect(() => validateAllowedRegions([])).toThrow(ValidationError);
  });

  it("throws with empty_allowed_regions code", () => {
    try {
      validateAllowedRegions([]);
    } catch (e) {
      expect(e).toMatchObject({ code: "empty_allowed_regions" });
    }
  });
});

describe("resolveRegions", () => {
  const allowed = ["us-east-1", "eu-west-1", "sa-east-1"];

  it("returns all allowed regions when none requested", () => {
    const result = resolveRegions(undefined, allowed);
    expect(result).toEqual(allowed);
  });

  it("returns all allowed regions when empty array requested", () => {
    const result = resolveRegions([], allowed);
    expect(result).toEqual(allowed);
  });

  it("returns a copy, not the original array", () => {
    const result = resolveRegions(undefined, allowed);
    expect(result).not.toBe(allowed);
  });

  it("accepts a subset of allowed regions", () => {
    const result = resolveRegions(["us-east-1"], allowed);
    expect(result).toEqual(["us-east-1"]);
  });

  it("rejects a region outside the allowlist", () => {
    expect(() => resolveRegions(["us-west-2"], allowed)).toThrow(
      ValidationError,
    );
  });

  it("throws with region_not_allowed code", () => {
    try {
      resolveRegions(["us-west-2"], allowed);
    } catch (e) {
      expect(e).toMatchObject({ code: "region_not_allowed" });
    }
  });

  it("throws when allowlist is empty", () => {
    expect(() => resolveRegions(undefined, [])).toThrow(ValidationError);
  });

  it("includes the rejected region name in the message", () => {
    try {
      resolveRegions(["ap-northeast-1"], allowed);
    } catch (e) {
      expect((e as ValidationError).message).toContain("ap-northeast-1");
    }
  });
});

describe("validateRegion", () => {
  it("does not throw for a valid region", () => {
    expect(() => validateRegion("us-east-1", ["us-east-1", "eu-west-1"])).not.toThrow();
  });

  it("throws ValidationError for a region not in the allowlist", () => {
    expect(() => validateRegion("us-west-2", ["us-east-1", "sa-east-1"])).toThrow(ValidationError);
  });

  it("throws with region_not_allowed code", () => {
    try {
      validateRegion("eu-central-1", ["us-east-1"]);
    } catch (e) {
      expect(e).toMatchObject({ code: "region_not_allowed" });
    }
  });

  it("includes the rejected region name in the message", () => {
    try {
      validateRegion("ap-southeast-1", ["us-east-1"]);
    } catch (e) {
      expect((e as ValidationError).message).toContain("ap-southeast-1");
    }
  });

  it("throws empty_allowed_regions when allowlist is empty", () => {
    try {
      validateRegion("us-east-1", []);
    } catch (e) {
      expect(e).toMatchObject({ code: "empty_allowed_regions" });
    }
  });
});
