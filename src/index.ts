import { createMcpHandler } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import { authenticateRequest } from "./auth/bearer.js";
import { validateEnv, envErrorResponse } from "./config/env.js";
import { buildGatewayContext } from "./config/context.js";
import { GatewayError, errorResponse } from "./errors/public-error.js";

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      const authResponse = authenticateRequest(request, env);
      const isAuthenticated = authResponse === null;

      const envResult = validateEnv(env);
      if (!envResult.valid) {
        return envErrorResponse(envResult, isAuthenticated);
      }

      if (authResponse) return authResponse;

      const gatewayCtx = buildGatewayContext(env);
      const server = createServer(gatewayCtx);
      return createMcpHandler(server)(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "aws-mcp-gateway" });
    }

    return errorResponse(new GatewayError("not_found", "Not Found"), 404);
  },
} satisfies ExportedHandler;
