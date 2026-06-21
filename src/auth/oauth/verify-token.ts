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

async function authenticateViaJwks(
  token: string,
  config: ValidatedOAuthConfig,
): Promise<Response | null> {
  if (!config.OAUTH_JWKS_URI) {
    return oauthUnauthorizedResponse(config);
  }

  const jwks = await getJwksResolver(config.OAUTH_JWKS_URI);
  const { payload } = await jwtVerify(token, jwks, {
    issuer: config.OAUTH_ISSUER,
  });
  const claims = payload as Record<string, unknown>;

  if (!hasExpectedAudience(claims, config.OAUTH_AUDIENCE)) {
    return oauthUnauthorizedResponse(config);
  }

  if (!hasValidTokenTimes(claims)) {
    return oauthUnauthorizedResponse(config);
  }

  const scopes = extractScopes(claims);
  if (!hasRequiredScopes(scopes, config.OAUTH_REQUIRED_SCOPES)) {
    return oauthForbiddenResponse(config);
  }

  return null;
}

export async function authenticateOAuthRequest(
  request: Request,
  config: ValidatedOAuthConfig,
): Promise<Response | null> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return oauthUnauthorizedResponse(config);
  }

  const token = authHeader.slice(7).trim();
  if (token.length === 0) {
    return oauthUnauthorizedResponse(config);
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
    if (config.OAUTH_TOKEN_VALIDATION_MODE === "hybrid") {
      try {
        return await authenticateViaIntrospection(token, config);
      } catch {
        return oauthUnauthorizedResponse(config);
      }
    }

    return oauthUnauthorizedResponse(config);
  }
}
