import { GatewayError, errorResponse } from "../errors/public-error.js";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface ValidatedGatewayConfig {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_ALLOWED_REGIONS: string;
  MCP_AUTH_TOKEN: string;
  AWS_MCP_CACHE?: KVNamespace;
}

export interface EnvValidationSuccess {
  valid: true;
  config: ValidatedGatewayConfig;
  errors: [];
}

export interface EnvValidationFailure {
  valid: false;
  config: null;
  errors: string[];
}

export type EnvValidationResult = EnvValidationSuccess | EnvValidationFailure;

function readRequiredString(
  bindings: Record<string, unknown>,
  key: string,
  errors: string[],
): string | null {
  const value = bindings[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(key);
    return null;
  }
  return value.trim();
}

export function validateEnv(env: unknown): EnvValidationResult {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const accessKeyId = readRequiredString(bindings, "AWS_ACCESS_KEY_ID", errors);
  const secretAccessKey = readRequiredString(bindings, "AWS_SECRET_ACCESS_KEY", errors);
  const region = readRequiredString(bindings, "AWS_REGION", errors);
  const allowedRegionsRaw = readRequiredString(bindings, "AWS_ALLOWED_REGIONS", errors);
  const authToken = readRequiredString(bindings, "MCP_AUTH_TOKEN", errors);

  if (allowedRegionsRaw !== null) {
    const parsed = allowedRegionsRaw.split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      errors.push("AWS_ALLOWED_REGIONS (empty after parsing)");
    } else if (region !== null && !parsed.includes(region)) {
      errors.push("AWS_REGION (not in AWS_ALLOWED_REGIONS)");
    }
  }

  if (errors.length > 0) {
    return { valid: false as const, config: null, errors };
  }

  return {
    valid: true as const,
    config: {
      AWS_ACCESS_KEY_ID: accessKeyId!,
      AWS_SECRET_ACCESS_KEY: secretAccessKey!,
      AWS_REGION: region!,
      AWS_ALLOWED_REGIONS: allowedRegionsRaw!,
      MCP_AUTH_TOKEN: authToken!,
      AWS_MCP_CACHE: bindings.AWS_MCP_CACHE as KVNamespace | undefined,
    },
    errors: [],
  };
}

export function envErrorResponse(
  result: EnvValidationResult,
  isAuthenticated: boolean,
): Response {
  if (isAuthenticated) {
    return errorResponse(
      new GatewayError(
        "configuration_error",
        `Gateway configuration is incomplete. Invalid settings: ${result.errors.join(", ")}`,
      ),
      503,
    );
  }

  return errorResponse(
    new GatewayError("configuration_error", "Gateway configuration is incomplete."),
    503,
  );
}
