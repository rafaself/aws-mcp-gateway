import { GatewayError, errorResponse } from "../../errors/public-error.js";
import { buildOAuthChallenge } from "./challenge.js";
import type { ValidatedOAuthConfig } from "./types.js";

function oauthUnauthorizedResponse(config: ValidatedOAuthConfig): Response {
  return errorResponse(
    new GatewayError("unauthorized", "Authentication is required."),
    401,
    { "WWW-Authenticate": buildOAuthChallenge(config) },
  );
}

/**
 * OAuth-mode authentication for /mcp before JWT validation (#77).
 * Rejects all requests with a discovery challenge until token verification is wired.
 */
export function authenticateOAuthRequestStub(
  _request: Request,
  config: ValidatedOAuthConfig,
): Response | null {
  return oauthUnauthorizedResponse(config);
}
