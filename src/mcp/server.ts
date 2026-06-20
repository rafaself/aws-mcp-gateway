import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "./context.js";
import { registerTools } from "./tools/index.js";

export function createServer(ctx: GatewayContext): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  registerTools(server, ctx);

  return server;
}
