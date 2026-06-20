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

export function validateEnv(env: unknown): EnvValidationResult {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const accessKeyId = bindings.AWS_ACCESS_KEY_ID;
  const secretAccessKey = bindings.AWS_SECRET_ACCESS_KEY;
  const region = bindings.AWS_REGION;
  const allowedRegionsRaw = bindings.AWS_ALLOWED_REGIONS;
  const authToken = bindings.MCP_AUTH_TOKEN;

  if (!accessKeyId) {
    errors.push("AWS_ACCESS_KEY_ID");
  }

  if (!secretAccessKey) {
    errors.push("AWS_SECRET_ACCESS_KEY");
  }

  if (!region) {
    errors.push("AWS_REGION");
  }

  if (!allowedRegionsRaw) {
    errors.push("AWS_ALLOWED_REGIONS");
  } else {
    const regions = String(allowedRegionsRaw).split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (regions.length === 0) {
      errors.push("AWS_ALLOWED_REGIONS (empty after parsing)");
    } else if (region && !regions.includes(String(region))) {
      errors.push("AWS_REGION (not in AWS_ALLOWED_REGIONS)");
    }
  }

  if (!authToken) {
    errors.push("MCP_AUTH_TOKEN");
  }

  if (errors.length > 0) {
    return { valid: false as const, config: null, errors };
  }

  return {
    valid: true as const,
    config: {
      AWS_ACCESS_KEY_ID: String(accessKeyId),
      AWS_SECRET_ACCESS_KEY: String(secretAccessKey),
      AWS_REGION: String(region),
      AWS_ALLOWED_REGIONS: String(allowedRegionsRaw),
      MCP_AUTH_TOKEN: String(authToken),
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
