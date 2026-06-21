import { extractScopes, hasRequiredScopes } from "./scopes.js";
import { hasExpectedAudience, hasValidTokenTimes } from "./token-claims.js";
import { oauthForbiddenResponse, oauthUnauthorizedResponse } from "./errors.js";
import type { ValidatedOAuthConfig } from "./types.js";

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export async function authenticateViaIntrospection(
  token: string,
  config: ValidatedOAuthConfig,
): Promise<Response | null> {
  const introspection = config.OAUTH_INTROSPECTION;
  if (!introspection) {
    return oauthUnauthorizedResponse(config);
  }

  const response = await fetch(introspection.url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: buildBasicAuthHeader(
        introspection.clientId,
        introspection.clientSecret,
      ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token,
      token_type_hint: "access_token",
    }),
  });

  if (!response.ok) {
    return oauthUnauthorizedResponse(config);
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (payload.active !== true) {
    return oauthUnauthorizedResponse(config);
  }

  if (typeof payload.iss === "string" && payload.iss !== config.OAUTH_ISSUER) {
    return oauthUnauthorizedResponse(config);
  }

  if (!hasExpectedAudience(payload, config.OAUTH_AUDIENCE)) {
    return oauthUnauthorizedResponse(config);
  }

  if (!hasValidTokenTimes(payload)) {
    return oauthUnauthorizedResponse(config);
  }

  const scopes = extractScopes(payload);
  if (!hasRequiredScopes(scopes, config.OAUTH_REQUIRED_SCOPES)) {
    return oauthForbiddenResponse(config);
  }

  return null;
}
