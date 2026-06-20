import { createMcpHandler } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import { authenticateRequest } from "./auth/index.js";
import { buildProtectedResourceMetadata } from "./auth/oauth/metadata.js";
import {
  parseAuthMode,
  validateEnv,
  validateOAuthConfig,
  envErrorResponse,
} from "./config/env.js";
import { buildGatewayContext } from "./config/context.js";
import { GatewayError, errorResponse } from "./errors/public-error.js";

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "aws-mcp-gateway" });
    }

    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      if (parseAuthMode(env) !== "oauth") {
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
      const authResponse = authenticateRequest(request, env);
      const isAuthenticated = authResponse === null;

      const envResult = validateEnv(env);
      if (!envResult.valid) {
        return envErrorResponse(envResult, isAuthenticated);
      }

      if (authResponse) return authResponse;

      const gatewayCtx = buildGatewayContext(envResult.config);
      const server = createServer(gatewayCtx);
      return createMcpHandler(server)(request, env, ctx);
    }

    return errorResponse(new GatewayError("not_found", "Not Found"), 404);
  },
} satisfies ExportedHandler;
