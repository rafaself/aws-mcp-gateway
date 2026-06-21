import type { AuthMode } from "./env.js";

export type AuthModeResolution =
  | { valid: true; mode: AuthMode }
  | { valid: false; errors: string[] };

export function resolveAuthMode(env: unknown): AuthModeResolution {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const mode = bindings.AUTH_MODE;

  if (mode === undefined) {
    return { valid: true, mode: "legacy-bearer" };
  }

  if (typeof mode !== "string") {
    return { valid: false, errors: ["AUTH_MODE (must be legacy-bearer or oauth)"] };
  }

  const trimmed = mode.trim();
  if (trimmed === "legacy-bearer" || trimmed === "oauth") {
    return { valid: true, mode: trimmed };
  }

  return { valid: false, errors: ["AUTH_MODE (must be legacy-bearer or oauth)"] };
}
