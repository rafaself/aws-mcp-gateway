import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "./auth-mode.js";

describe("resolveAuthMode", () => {
  it("defaults to legacy-bearer when AUTH_MODE is absent", () => {
    expect(resolveAuthMode({})).toEqual({ valid: true, mode: "legacy-bearer" });
  });

  it("accepts legacy-bearer and oauth", () => {
    expect(resolveAuthMode({ AUTH_MODE: "legacy-bearer" })).toEqual({
      valid: true,
      mode: "legacy-bearer",
    });
    expect(resolveAuthMode({ AUTH_MODE: "oauth" })).toEqual({ valid: true, mode: "oauth" });
  });

  it("rejects invalid AUTH_MODE values", () => {
    expect(resolveAuthMode({ AUTH_MODE: "open" })).toEqual({
      valid: false,
      errors: ["AUTH_MODE (must be legacy-bearer or oauth)"],
    });
    expect(resolveAuthMode({ AUTH_MODE: 123 })).toEqual({
      valid: false,
      errors: ["AUTH_MODE (must be legacy-bearer or oauth)"],
    });
  });
});
