import { authenticateLocalBearerRequest } from "./bearer.js";
import { authenticateOAuthRequest } from "./oauth/verify-token.js";
import { GatewayError, errorResponse } from "../errors/public-error.js";
import { resolveAuthMode, validateOAuthConfig } from "../config/env.js";
import type { AuthResult } from "./result.js";

export type { AuthResult } from "./result.js";

export async function authenticateRequest(
  request: Request,
  env: unknown,
): Promise<AuthResult> {
  const authModeResult = resolveAuthMode(env);
  if (!authModeResult.valid) {
    return {
      ok: false,
      response: errorResponse(
        new GatewayError("configuration_error", "Gateway configuration is incomplete."),
        503,
      ),
    };
  }

  if (authModeResult.mode === "oauth") {
    const oauthResult = validateOAuthConfig(env);
    if (!oauthResult.valid) {
      return {
        ok: false,
        response: errorResponse(
          new GatewayError("configuration_error", "Gateway configuration is incomplete."),
          503,
        ),
      };
    }
    return authenticateOAuthRequest(request, oauthResult.config!);
  }

  return authenticateLocalBearerRequest(request, env);
}
