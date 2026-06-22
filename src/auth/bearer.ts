import { GatewayError, errorResponse } from "../errors/public-error.js";
import type { AuthResult } from "./result.js";
import { LOCAL_BEARER_GRANTED_SCOPES } from "./oauth/scopes.js";

function unauthorizedResult(): AuthResult {
  return {
    ok: false,
    response: errorResponse(
      new GatewayError("unauthorized", "Authentication is required."),
      401,
    ),
  };
}

export function authenticateLegacyBearerRequest(
  request: Request,
  env: unknown,
): AuthResult {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorizedResult();
  }

  const token = authHeader.slice(7);
  const bindings = env as Record<string, string | undefined>;

  if (token !== bindings.MCP_AUTH_TOKEN) {
    return unauthorizedResult();
  }

  return { ok: true, grantedScopes: LOCAL_BEARER_GRANTED_SCOPES };
}
