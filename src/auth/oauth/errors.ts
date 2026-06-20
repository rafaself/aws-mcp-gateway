import { GatewayError, errorResponse } from "../../errors/public-error.js";
import { buildOAuthChallenge } from "./challenge.js";
import type { ValidatedOAuthConfig } from "./types.js";

export function oauthUnauthorizedResponse(config: ValidatedOAuthConfig): Response {
  return errorResponse(
    new GatewayError("unauthorized", "Authentication is required."),
    401,
    { "WWW-Authenticate": buildOAuthChallenge(config) },
  );
}

export function oauthForbiddenResponse(config: ValidatedOAuthConfig): Response {
  return errorResponse(
    new GatewayError("forbidden", "Insufficient scope for this resource."),
    403,
    { "WWW-Authenticate": buildOAuthChallenge(config) },
  );
}
