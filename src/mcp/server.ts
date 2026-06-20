import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type GatewayContext, registerDiagnosticTools, registerCostTools } from "./tools.js";

export function createServer(ctx: GatewayContext): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  registerDiagnosticTools(server);
  registerCostTools(server, ctx);

  return server;
}
