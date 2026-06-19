import { createMcpHandler } from "agents/mcp";
import { createServer } from "./mcp/server.js";
import { authenticateRequest } from "./auth.js";

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      const authResponse = authenticateRequest(request, env);
      if (authResponse) return authResponse;

      const server = createServer();
      return createMcpHandler(server)(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "aws-mcp-gateway" });
    }

    return Response.json({ error: "Not Found" }, { status: 404 });
  },
} satisfies ExportedHandler;
