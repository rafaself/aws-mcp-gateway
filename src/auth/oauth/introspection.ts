import { extractScopes, hasRequiredScopes } from "./scopes.js";
import { hasExpectedAudience, hasValidTokenTimes } from "./token-claims.js";
import { oauthForbiddenResponse, oauthUnauthorizedResponse } from "./errors.js";
import type { ValidatedOAuthConfig } from "./types.js";
import { buildClaimDiagnostics, buildScopeDiagnostics } from "./diagnostics.js";
import { logWarn } from "../../observability/logging.js";
import type { AuthResult } from "../result.js";

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

export async function authenticateViaIntrospection(
  token: string,
  config: ValidatedOAuthConfig,
): Promise<AuthResult> {
  const introspection = config.OAUTH_INTROSPECTION;
  if (!introspection) {
    return { ok: false, response: oauthUnauthorizedResponse(config) };
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
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  const payload = (await response.json()) as Record<string, unknown>;

  if (payload.active !== true) {
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  if (typeof payload.iss === "string" && payload.iss !== config.OAUTH_ISSUER) {
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  if (!hasExpectedAudience(payload, config.OAUTH_AUDIENCE)) {
    logWarn({
      phase: "oauth_audience_denied",
      validationMode: "introspection",
      audienceValidated: false,
      ...buildClaimDiagnostics(payload),
    });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  if (!hasValidTokenTimes(payload)) {
    logWarn({
      phase: "oauth_time_denied",
      validationMode: "introspection",
      timeValidated: false,
      ...buildClaimDiagnostics(payload),
    });
    return { ok: false, response: oauthUnauthorizedResponse(config) };
  }

  const scopes = extractScopes(payload);
  if (!hasRequiredScopes(scopes, config.OAUTH_REQUIRED_SCOPES)) {
    logWarn({
      phase: "oauth_scope_denied",
      validationMode: "introspection",
      ...buildScopeDiagnostics(payload, config.OAUTH_REQUIRED_SCOPES),
    });
    return { ok: false, response: oauthForbiddenResponse(config) };
  }

  return { ok: true, grantedScopes: scopes };
}
