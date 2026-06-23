import { describe, it, expect } from "vitest";
import {
  buildParameterPath,
  normalizeParameterPrefix,
  validateParameterPrefix,
  validateRequiredParameterNames,
} from "./validation.js";
import { SsmError } from "./types.js";

describe("validateParameterPrefix", () => {
  it("accepts a valid path-like prefix", () => {
    expect(validateParameterPrefix("/app/prod")).toBe("/app/prod");
  });

  it("normalizes trailing slash", () => {
    expect(validateParameterPrefix("/app/prod/")).toBe("/app/prod");
  });

  it("rejects empty prefix", () => {
    expect(() => validateParameterPrefix("")).toThrow(SsmError);
  });

  it("rejects prefix without leading slash", () => {
    expect(() => validateParameterPrefix("app/prod")).toThrow(SsmError);
  });

  it("rejects connection string-like prefix", () => {
    expect(() => validateParameterPrefix("/postgres://host/db")).toThrow(SsmError);
  });

  it("rejects secret-like key=value prefix", () => {
    expect(() => validateParameterPrefix("/config/password=secret")).toThrow(SsmError);
  });
});

describe("validateRequiredParameterNames", () => {
  it("accepts relative parameter names", () => {
    expect(validateRequiredParameterNames(["db/host", "api-key"])).toEqual([
      "db/host",
      "api-key",
    ]);
  });

  it("rejects empty array", () => {
    expect(() => validateRequiredParameterNames([])).toThrow(SsmError);
  });

  it("rejects absolute names", () => {
    expect(() => validateRequiredParameterNames(["/db/host"])).toThrow(SsmError);
  });

  it("rejects secret-like values", () => {
    expect(() => validateRequiredParameterNames(["token=abc123"])).toThrow(SsmError);
  });
});

describe("buildParameterPath", () => {
  it("joins prefix and name without duplicate slashes", () => {
    expect(buildParameterPath("/app/prod/", "db/host")).toBe("/app/prod/db/host");
    expect(normalizeParameterPrefix("/app/prod/")).toBe("/app/prod");
  });
});
