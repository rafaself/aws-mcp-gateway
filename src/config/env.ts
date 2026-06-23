import { GatewayError, errorResponse } from "../errors/public-error.js";
import type { DurableObjectNamespace, KVNamespace } from "@cloudflare/workers-types";
import type { ValidatedOAuthConfig } from "../auth/oauth/types.js";
import type {
  OAuthTokenValidationMode,
  ValidatedOAuthIntrospectionConfig,
} from "../auth/oauth/types.js";
import { resolveAuthMode } from "./auth-mode.js";
import {
  validateOAuthAudienceUrl,
  validateOAuthIntrospectionUrl,
  validateOAuthIssuerUrl,
  validateOAuthJwksUri,
  validateOAuthResourceUrl,
} from "./oauth-urls.js";
import type { ValidatedRateLimitConfig } from "../security/rate-limit.js";
import {
  defaultResolvedToolExposure,
  validateToolExposureConfig,
  type ValidatedToolExposureConfig,
} from "./tool-exposure.js";
import { APP_PROFILE_DEFAULT_INDEX_KEY } from "../security/limits.js";

export type { ValidatedToolExposureConfig };

export type AuthMode = "local-bearer" | "oauth";

export interface ValidatedGatewayConfig {
  authMode: AuthMode;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  AWS_ALLOWED_REGIONS: string;
  MCP_AUTH_TOKEN?: string;
  oauth?: ValidatedOAuthConfig;
  rateLimit?: ValidatedRateLimitConfig;
  AWS_MCP_CACHE?: KVNamespace;
  AWS_MCP_APP_CONFIG?: KVNamespace;
  AWS_MCP_APP_PROFILE_INDEX_KEY: string;
  toolExposure: ValidatedToolExposureConfig;
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

function readOptionalString(bindings: Record<string, unknown>, key: string): string | null {
  const value = bindings[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInteger(
  value: string | null,
  key: string,
  errors: string[],
  fallback: number,
): number {
  if (value === null) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.push(`${key} (must be a positive integer)`);
    return fallback;
  }

  return parsed;
}

function resolveOAuthTokenValidationMode(
  value: string | null,
  errors: string[],
): OAuthTokenValidationMode {
  if (value === null) {
    return "jwks";
  }

  if (value === "jwks" || value === "introspection" || value === "hybrid") {
    return value;
  }

  errors.push("OAUTH_TOKEN_VALIDATION_MODE (must be jwks, introspection, or hybrid)");
  return "jwks";
}

export function validateRateLimitConfig(
  env: unknown,
): {
  valid: boolean;
  config: ValidatedRateLimitConfig | null;
  errors: string[];
} {
  const bindings = (env ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const authModeResult = resolveAuthMode(env);

  if (!authModeResult.valid) {
    return { valid: false, config: null, errors: authModeResult.errors };
  }

  const namespace = bindings.AUTH_RATE_LIMITER as DurableObjectNamespace | undefined;
  const maxRequests = parsePositiveInteger(
    readOptionalString(bindings, "RATE_LIMIT_MAX_REQUESTS"),
    "RATE_LIMIT_MAX_REQUESTS",
    errors,
    120,
  );
  const windowSeconds = parsePositiveInteger(
    readOptionalString(bindings, "RATE_LIMIT_WINDOW_SECONDS"),
    "RATE_LIMIT_WINDOW_SECONDS",
    errors,
    60,
  );

  if (authModeResult.mode !== "oauth" && namespace === undefined) {
    return { valid: errors.length === 0, config: null, errors };
  }

  if (namespace === undefined) {
    errors.push("AUTH_RATE_LIMITER");
  }

  if (errors.length > 0) {
    return { valid: false, config: null, errors };
  }

  return {
    valid: true,
    config: {
      namespace: namespace!,
      maxRequests,
      windowSeconds,
    },
    errors: [],
  };
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
  const scopesRaw = readRequiredString(bindings, "OAUTH_REQUIRED_SCOPES", errors);
  const tokenValidationMode = resolveOAuthTokenValidationMode(
    readOptionalString(bindings, "OAUTH_TOKEN_VALIDATION_MODE"),
    errors,
  );
  const jwksUriRaw =
    tokenValidationMode === "introspection"
      ? readOptionalString(bindings, "OAUTH_JWKS_URI")
      : readRequiredString(bindings, "OAUTH_JWKS_URI", errors);
  const introspectionUrlRaw =
    tokenValidationMode === "jwks"
      ? readOptionalString(bindings, "OAUTH_INTROSPECTION_URL")
      : readRequiredString(bindings, "OAUTH_INTROSPECTION_URL", errors);
  const introspectionClientId =
    tokenValidationMode === "jwks"
      ? readOptionalString(bindings, "OAUTH_INTROSPECTION_CLIENT_ID")
      : readRequiredString(bindings, "OAUTH_INTROSPECTION_CLIENT_ID", errors);
  const introspectionClientSecret =
    tokenValidationMode === "jwks"
      ? readOptionalString(bindings, "OAUTH_INTROSPECTION_CLIENT_SECRET")
      : readRequiredString(bindings, "OAUTH_INTROSPECTION_CLIENT_SECRET", errors);

  const resourceUrl =
    resourceUrlRaw === null ? null : validateOAuthResourceUrl(resourceUrlRaw, errors);
  const issuer = issuerRaw === null ? null : validateOAuthIssuerUrl(issuerRaw, errors);
  const audience =
    audienceRaw === null ? null : validateOAuthAudienceUrl(audienceRaw, errors);
  const jwksUri =
    jwksUriRaw === null ? null : validateOAuthJwksUri(jwksUriRaw, errors);
  const introspectionUrl =
    introspectionUrlRaw === null
      ? null
      : validateOAuthIntrospectionUrl(introspectionUrlRaw, errors);

  let introspection: ValidatedOAuthIntrospectionConfig | undefined;
  if (
    introspectionUrl !== null
    && introspectionClientId !== null
    && introspectionClientSecret !== null
  ) {
    introspection = {
      url: introspectionUrl,
      clientId: introspectionClientId,
      clientSecret: introspectionClientSecret,
    };
  }

  if (resourceUrl !== null && audience !== null && resourceUrl !== audience) {
    errors.push("OAUTH_AUDIENCE (must equal MCP_RESOURCE_URL)");
  }

  if ((tokenValidationMode === "jwks" || tokenValidationMode === "hybrid") && jwksUri === null) {
    errors.push("OAUTH_JWKS_URI");
  }

  if (
    (tokenValidationMode === "introspection" || tokenValidationMode === "hybrid")
    && introspection === undefined
  ) {
    errors.push("OAUTH_INTROSPECTION_URL / OAUTH_INTROSPECTION_CLIENT_ID / OAUTH_INTROSPECTION_CLIENT_SECRET");
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
      OAUTH_JWKS_URI: jwksUri ?? undefined,
      OAUTH_REQUIRED_SCOPES: scopes,
      OAUTH_TOKEN_VALIDATION_MODE: tokenValidationMode,
      OAUTH_INTROSPECTION: introspection,
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
  if (authMode === "local-bearer") {
    authToken = readRequiredString(bindings, "MCP_AUTH_TOKEN", errors);
  }

  let oauthConfig: ValidatedOAuthConfig | undefined;
  let rateLimitConfig: ValidatedRateLimitConfig | undefined;
  if (authMode === "oauth") {
    const oauthResult = validateOAuthConfig(env);
    if (!oauthResult.valid) {
      errors.push(...oauthResult.errors);
    } else {
      oauthConfig = oauthResult.config!;
    }

    const rateLimitResult = validateRateLimitConfig(env);
    if (!rateLimitResult.valid) {
      errors.push(...rateLimitResult.errors);
    } else {
      rateLimitConfig = rateLimitResult.config ?? undefined;
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

  const toolExposure =
    validateToolExposureConfig(bindings, errors) ?? defaultResolvedToolExposure();

  if (errors.length > 0) {
    return { valid: false as const, config: null, errors };
  }

  const appProfileIndexKey =
    readOptionalString(bindings, "AWS_MCP_APP_PROFILE_INDEX_KEY") ??
    APP_PROFILE_DEFAULT_INDEX_KEY;

  const config: ValidatedGatewayConfig = {
    authMode,
    AWS_ACCESS_KEY_ID: accessKeyId!,
    AWS_SECRET_ACCESS_KEY: secretAccessKey!,
    AWS_REGION: region!,
    AWS_ALLOWED_REGIONS: allowedRegionsRaw!,
    AWS_MCP_CACHE: bindings.AWS_MCP_CACHE as KVNamespace | undefined,
    AWS_MCP_APP_CONFIG: bindings.AWS_MCP_APP_CONFIG as KVNamespace | undefined,
    AWS_MCP_APP_PROFILE_INDEX_KEY: appProfileIndexKey,
    toolExposure,
  };

  if (authMode === "local-bearer") {
    config.MCP_AUTH_TOKEN = authToken!;
  } else {
    config.oauth = oauthConfig;
    config.rateLimit = rateLimitConfig;
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
