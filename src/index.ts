import { createMcpHandler, WorkerTransport } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import { authenticateRequest } from "./auth/index.js";
import { buildProtectedResourceMetadata } from "./auth/oauth/metadata.js";
import {
  resolveAuthMode,
  validateEnv,
  validateOAuthConfig,
  validateRateLimitConfig,
  envErrorResponse,
} from "./config/env.js";
import { buildGatewayContext } from "./config/context.js";
import { GatewayError, errorResponse } from "./errors/public-error.js";
import { AuthRateLimitDurableObject, enforceRateLimit } from "./security/rate-limit.js";

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "aws-mcp-gateway" });
    }

    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      const authModeResult = resolveAuthMode(env);
      if (!authModeResult.valid) {
        return envErrorResponse(
          { valid: false, config: null, errors: authModeResult.errors },
          false,
        );
      }
      if (authModeResult.mode !== "oauth") {
        return errorResponse(new GatewayError("not_found", "Not Found"), 404);
      }

      const oauthResult = validateOAuthConfig(env);
      if (!oauthResult.valid) {
        return envErrorResponse(
          { valid: false, config: null, errors: oauthResult.errors },
          false,
        );
      }

      return Response.json(buildProtectedResourceMetadata(oauthResult.config!));
    }

    if (url.pathname === "/mcp") {
      const rateLimitResult = validateRateLimitConfig(env);
      if (!rateLimitResult.valid) {
        return envErrorResponse(
          { valid: false, config: null, errors: rateLimitResult.errors },
          false,
        );
      }

      const rateLimitResponse = await enforceRateLimit(request, rateLimitResult.config);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const authResponse = await authenticateRequest(request, env);
      if (authResponse) {
        return authResponse;
      }

      const envResult = validateEnv(env);
      if (!envResult.valid) {
        return envErrorResponse(envResult, true);
      }

      const gatewayCtx = buildGatewayContext(envResult.config);
      const server = createServer(gatewayCtx);
      const isInitializeRequest = await isInitializeRpcRequest(request);
      let initializedSessionId: string | undefined;
      const transport = new WorkerTransport({
        ...(isInitializeRequest
          ? {
              // Work around a transport/header propagation issue observed in ChatGPT.
              onsessioninitialized: (sessionId: string) => {
                initializedSessionId = sessionId;
              },
            }
          : {}),
      } as ConstructorParameters<typeof WorkerTransport>[0]);

      const response = await createMcpHandler(server, { transport })(request, env, ctx);
      if (!isInitializeRequest) {
        return response;
      }

      const sessionId =
        response.headers.get("mcp-session-id") ??
        initializedSessionId ??
        transport.sessionId;
      if (!sessionId) {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.set("mcp-session-id", sessionId);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return errorResponse(new GatewayError("not_found", "Not Found"), 404);
  },
} satisfies ExportedHandler;

export { AuthRateLimitDurableObject };

async function isInitializeRpcRequest(request: Request): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  try {
    const body = (await request.clone().json()) as unknown;
    if (Array.isArray(body)) {
      return body.length === 1 && hasInitializeMethod(body[0]);
    }
    return hasInitializeMethod(body);
  } catch {
    return false;
  }
}

function hasInitializeMethod(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "method" in body &&
    (body as { method?: unknown }).method === "initialize"
  );
}
