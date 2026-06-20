import { authenticateLegacyBearerRequest } from "./bearer.js";
import { authenticateOAuthRequest } from "./oauth/verify-token.js";
import { GatewayError, errorResponse } from "../errors/public-error.js";
import { parseAuthMode, validateOAuthConfig } from "../config/env.js";

export async function authenticateRequest(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  const authMode = parseAuthMode(env);

  if (authMode === "oauth") {
    const oauthResult = validateOAuthConfig(env);
    if (!oauthResult.valid) {
      return errorResponse(
        new GatewayError("configuration_error", "Gateway configuration is incomplete."),
        503,
      );
    }
    return authenticateOAuthRequest(request, oauthResult.config!);
  }

  return authenticateLegacyBearerRequest(request, env);
}
