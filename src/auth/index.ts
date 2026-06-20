import { authenticateLegacyBearerRequest } from "./bearer.js";
import { authenticateOAuthRequestStub } from "./oauth/oauth-auth.js";
import { GatewayError, errorResponse } from "../errors/public-error.js";
import { parseAuthMode, validateOAuthConfig } from "../config/env.js";

export function authenticateRequest(request: Request, env: unknown): Response | null {
  const authMode = parseAuthMode(env);

  if (authMode === "oauth") {
    const oauthResult = validateOAuthConfig(env);
    if (!oauthResult.valid) {
      return errorResponse(
        new GatewayError("configuration_error", "Gateway configuration is incomplete."),
        503,
      );
    }
    return authenticateOAuthRequestStub(request, oauthResult.config!);
  }

  return authenticateLegacyBearerRequest(request, env);
}
