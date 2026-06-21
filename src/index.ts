import { createServer } from "./mcp/server.js";
import { createStreamableHttpMcpHandler } from "./mcp/streamable-http-handler.js";
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
      const handler = createStreamableHttpMcpHandler({
        createServer: () => createServer(gatewayCtx),
      });
      return handler(request);
    }

    return errorResponse(new GatewayError("not_found", "Not Found"), 404);
  },
} satisfies ExportedHandler;

export { AuthRateLimitDurableObject };
