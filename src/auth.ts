import { GatewayError, errorResponse } from "./errors.js";

function unauthorizedResponse(): Response {
  return errorResponse(
    new GatewayError("unauthorized", "Authentication is required."),
    401,
  );
}

export function authenticateRequest(request: Request, env: unknown): Response | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorizedResponse();
  }

  const token = authHeader.slice(7);
  const bindings = env as Record<string, string | undefined>;

  if (token !== bindings.MCP_AUTH_TOKEN) {
    return unauthorizedResponse();
  }

  return null;
}
