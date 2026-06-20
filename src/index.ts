import { createMcpHandler } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import type { GatewayContext } from "./mcp/tools.js";
import { authenticateRequest } from "./auth.js";
import { validateEnv, envErrorResponse } from "./env.js";

function buildGatewayContext(env: unknown): GatewayContext {
  const bindings = env as Record<string, string | undefined>;
  return {
    credentials: {
      accessKeyId: bindings.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: bindings.AWS_SECRET_ACCESS_KEY ?? "",
    },
    region: bindings.AWS_REGION ?? "us-east-1",
    allowedRegions: (bindings.AWS_ALLOWED_REGIONS ?? "us-east-1")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean),
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

    return Response.json({ error: "Not Found" }, { status: 404 });
  },
} satisfies ExportedHandler;
