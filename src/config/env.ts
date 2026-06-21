import { GatewayError, errorResponse } from "../errors/public-error.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { ValidatedOAuthConfig } from "../auth/oauth/types.js";
import { resolveAuthMode } from "./auth-mode.js";
import {
  validateOAuthAudienceUrl,
  validateOAuthIssuerUrl,
  validateOAuthJwksUri,
  validateOAuthResourceUrl,
} from "./oauth-urls.js";

export type AuthMode = "legacy-bearer" | "oauth";

export interface ValidatedGatewayConfig {
  authMode: AuthMode;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_ALLOWED_REGIONS: string;
  MCP_AUTH_TOKEN?: string;
  oauth?: ValidatedOAuthConfig;
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

export { resolveAuthMode } from "./auth-mode.js";

export function validateOAuthConfig(env: unknown): {
  valid: boolean;
  config: ValidatedOAuthConfig | null;
  errors: string[];
} {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const resourceUrlRaw = readRequiredString(bindings, "MCP_RESOURCE_URL", errors);
  const issuerRaw = readRequiredString(bindings, "OAUTH_ISSUER", errors);
  const audienceRaw = readRequiredString(bindings, "OAUTH_AUDIENCE", errors);
  const jwksUriRaw = readRequiredString(bindings, "OAUTH_JWKS_URI", errors);
  const scopesRaw = readRequiredString(bindings, "OAUTH_REQUIRED_SCOPES", errors);

  const resourceUrl =
    resourceUrlRaw === null ? null : validateOAuthResourceUrl(resourceUrlRaw, errors);
  const issuer = issuerRaw === null ? null : validateOAuthIssuerUrl(issuerRaw, errors);
  const audience =
    audienceRaw === null ? null : validateOAuthAudienceUrl(audienceRaw, errors);
  const jwksUri = jwksUriRaw === null ? null : validateOAuthJwksUri(jwksUriRaw, errors);

  if (resourceUrl !== null && audience !== null && resourceUrl !== audience) {
    errors.push("OAUTH_AUDIENCE (must equal MCP_RESOURCE_URL)");
  }

  if (errors.length > 0) {
    return { valid: false, config: null, errors };
  }

  const scopes = scopesRaw!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    return {
      valid: false,
      config: null,
      errors: ["OAUTH_REQUIRED_SCOPES (empty after parsing)"],
    };
  }

  return {
    valid: true,
    config: {
      MCP_RESOURCE_URL: resourceUrl!,
      OAUTH_ISSUER: issuer!,
      OAUTH_AUDIENCE: audience!,
      OAUTH_JWKS_URI: jwksUri!,
      OAUTH_REQUIRED_SCOPES: scopes,
    },
    errors: [],
  };
}

export function validateEnv(env: unknown): EnvValidationResult {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const authModeResult = resolveAuthMode(env);
  if (!authModeResult.valid) {
    return { valid: false as const, config: null, errors: authModeResult.errors };
  }
  const authMode = authModeResult.mode;

  const accessKeyId = readRequiredString(bindings, "AWS_ACCESS_KEY_ID", errors);
  const secretAccessKey = readRequiredString(bindings, "AWS_SECRET_ACCESS_KEY", errors);
  const region = readRequiredString(bindings, "AWS_REGION", errors);
  const allowedRegionsRaw = readRequiredString(bindings, "AWS_ALLOWED_REGIONS", errors);

  let authToken: string | null = null;
  if (authMode === "legacy-bearer") {
    authToken = readRequiredString(bindings, "MCP_AUTH_TOKEN", errors);
  }

  let oauthConfig: ValidatedOAuthConfig | undefined;
  if (authMode === "oauth") {
    const oauthResult = validateOAuthConfig(env);
    if (!oauthResult.valid) {
      errors.push(...oauthResult.errors);
    } else {
      oauthConfig = oauthResult.config!;
    }
  }

  if (allowedRegionsRaw !== null) {
    const parsed = allowedRegionsRaw
      .split(",")
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

  const config: ValidatedGatewayConfig = {
    authMode,
    AWS_ACCESS_KEY_ID: accessKeyId!,
    AWS_SECRET_ACCESS_KEY: secretAccessKey!,
    AWS_REGION: region!,
    AWS_ALLOWED_REGIONS: allowedRegionsRaw!,
    AWS_MCP_CACHE: bindings.AWS_MCP_CACHE as KVNamespace | undefined,
  };

  if (authMode === "legacy-bearer") {
    config.MCP_AUTH_TOKEN = authToken!;
  } else {
    config.oauth = oauthConfig;
  }

  return { valid: true as const, config, errors: [] };
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
