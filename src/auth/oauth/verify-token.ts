import { jwtVerify } from "jose";
import { getJwksResolver } from "./jwks.js";
import { extractScopes, hasRequiredScopes } from "./scopes.js";
import { oauthForbiddenResponse, oauthUnauthorizedResponse } from "./errors.js";
import type { ValidatedOAuthConfig } from "./types.js";
import { authenticateViaIntrospection } from "./introspection.js";
import {
  hasExpectedAudience,
  hasValidTokenTimes,
  isLikelyJwt,
} from "./token-claims.js";
import { buildClaimDiagnostics, buildScopeDiagnostics } from "./diagnostics.js";
import { logInfo, logWarn } from "../../observability/logging.js";
import type { AuthResult } from "../result.js";

async function authenticateViaJwks(
  token: string,
  config: ValidatedOAuthConfig,
): Promise<AuthResult> {
  if (!config.OAUTH_JWKS_URI) {
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  const jwks = await getJwksResolver(config.OAUTH_JWKS_URI);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.OAUTH_ISSUER,
  });
  const claims = payload as Record<string, unknown>;

  logInfo({
    phase: "oauth_jwt_verified",
    validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
    ...buildClaimDiagnostics(claims),
  });

  if (!hasExpectedAudience(claims, config.OAUTH_AUDIENCE)) {
    logWarn({
      phase: "oauth_audience_denied",
      validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
      audienceValidated: false,
      ...buildClaimDiagnostics(claims),
    });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  if (!hasValidTokenTimes(claims)) {
    logWarn({
      phase: "oauth_time_denied",
      validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
      timeValidated: false,
      ...buildClaimDiagnostics(claims),
    });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  const scopes = extractScopes(claims);
  if (!hasRequiredScopes(scopes, config.OAUTH_REQUIRED_SCOPES)) {
    logWarn({
      phase: "oauth_scope_denied",
      validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
      ...buildScopeDiagnostics(claims, config.OAUTH_REQUIRED_SCOPES),
    });
    return { ok: false, response: oauthForbiddenResponse(config) };
  }

  logInfo({
    phase: "oauth_scope_accepted",
    validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
    ...buildScopeDiagnostics(claims, config.OAUTH_REQUIRED_SCOPES),
  });

  return { ok: true, grantedScopes: scopes };
}

export async function authenticateOAuthRequest(
  request: Request,
  config: ValidatedOAuthConfig,
): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logWarn({ phase: "oauth_token_missing" });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  const token = authHeader.slice(7).trim();
  if (token.length === 0) {
    logWarn({ phase: "oauth_token_empty" });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  try {
    if (config.OAUTH_TOKEN_VALIDATION_MODE === "introspection") {
      return await authenticateViaIntrospection(token, config);
    }

    if (config.OAUTH_TOKEN_VALIDATION_MODE === "hybrid" && !isLikelyJwt(token)) {
      return await authenticateViaIntrospection(token, config);
    }

    return await authenticateViaJwks(token, config);
  } catch {
    logWarn({
      phase: "oauth_jwt_verify_failed",
      validationMode: config.OAUTH_TOKEN_VALIDATION_MODE,
    });

    if (config.OAUTH_TOKEN_VALIDATION_MODE === "hybrid") {
      try {
        return await authenticateViaIntrospection(token, config);
      } catch {
        return { ok: false, response: oauthUnauthorizedResponse(config) };
      }
    }

    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }
}
