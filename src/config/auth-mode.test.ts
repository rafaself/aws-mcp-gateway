import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "./auth-mode.js";

describe("resolveAuthMode", () => {
  it("defaults to local-bearer when AUTH_MODE is absent", () => {
    expect(resolveAuthMode({})).toEqual({ valid: true, mode: "local-bearer" });
  });

  it("accepts local-bearer and oauth", () => {
    expect(resolveAuthMode({ AUTH_MODE: "local-bearer" })).toEqual({
      valid: true,
      mode: "local-bearer",
    });
    expect(resolveAuthMode({ AUTH_MODE: "oauth" })).toEqual({ valid: true, mode: "oauth" });
  });

  it("rejects invalid AUTH_MODE values", () => {
    expect(resolveAuthMode({ AUTH_MODE: "open" })).toEqual({
      valid: false,
      errors: ["AUTH_MODE (must be local-bearer or oauth)"],
    });
    expect(resolveAuthMode({ AUTH_MODE: 123 })).toEqual({
      valid: false,
      errors: ["AUTH_MODE (must be local-bearer or oauth)"],
    });
  });
});
