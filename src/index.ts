import { createMcpHandler } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import type { GatewayContext } from "./mcp/tools.js";
import { authenticateRequest } from "./auth.js";
import { validateEnv, envErrorResponse } from "./env.js";
import { parseRegions } from "./security/regions.js";
import { GatewayError, errorResponse } from "./errors.js";
import type { KVNamespace } from "@cloudflare/workers-types";

function buildGatewayContext(env: unknown): GatewayContext {
  const bindings = env as Record<string, unknown>;
  return {
    credentials: {
      accessKeyId: (bindings.AWS_ACCESS_KEY_ID as string) ?? "",
      secretAccessKey: (bindings.AWS_SECRET_ACCESS_KEY as string) ?? "",
    },
    region: (bindings.AWS_REGION as string) ?? "us-east-1",
    allowedRegions: parseRegions(
      (bindings.AWS_ALLOWED_REGIONS as string) ?? "us-east-1",
    ),
    cache: bindings.AWS_MCP_CACHE as KVNamespace | undefined,
  };
}

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
