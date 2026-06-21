import { jwtVerify } from "jose";
import { getJwksResolver } from "./jwks.js";
import { extractScopes, hasRequiredScopes } from "./scopes.js";
import { oauthForbiddenResponse, oauthUnauthorizedResponse } from "./errors.js";
import type { ValidatedOAuthConfig } from "./types.js";

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
    const jwks = await getJwksResolver(config.OAUTH_JWKS_URI);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.OAUTH_ISSUER,
      audience: config.OAUTH_AUDIENCE,
    });

    const scopes = extractScopes(payload as Record<string, unknown>);
    if (!hasRequiredScopes(scopes, config.OAUTH_REQUIRED_SCOPES)) {
      return oauthForbiddenResponse(config);
    }

    return null;
  } catch {
    return oauthUnauthorizedResponse(config);
  }
}
