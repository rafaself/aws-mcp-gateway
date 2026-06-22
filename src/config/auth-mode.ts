import type { AuthMode } from "./env.js";

export type AuthModeResolution =
  | { valid: true; mode: AuthMode }
  | { valid: false; errors: string[] };

export function resolveAuthMode(env: unknown): AuthModeResolution {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const mode = bindings.AUTH_MODE;

  if (mode === undefined) {
    return { valid: true, mode: "local-bearer" };
  }

  if (typeof mode !== "string") {
    return { valid: false, errors: ["AUTH_MODE (must be local-bearer or oauth)"] };
  }

  const trimmed = mode.trim();
  if (trimmed === "local-bearer" || trimmed === "legacy-bearer") {
    return { valid: true, mode: "local-bearer" };
  }
  if (trimmed === "oauth") {
    return { valid: true, mode: "oauth" };
  }

  return { valid: false, errors: ["AUTH_MODE (must be local-bearer or oauth)"] };
}
