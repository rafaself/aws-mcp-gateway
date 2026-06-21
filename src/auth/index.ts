import { authenticateLegacyBearerRequest } from "./bearer.js";
import { authenticateOAuthRequest } from "./oauth/verify-token.js";
import { GatewayError, errorResponse } from "../errors/public-error.js";
import { resolveAuthMode, validateOAuthConfig } from "../config/env.js";

export async function authenticateRequest(
  request: Request,
  env: unknown,
): Promise<Response | null> {
  const authModeResult = resolveAuthMode(env);
  if (!authModeResult.valid) {
    return errorResponse(
      new GatewayError("configuration_error", "Gateway configuration is incomplete."),
      503,
    );
  }

  if (authModeResult.mode === "oauth") {
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
