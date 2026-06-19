import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiagnosticTools } from "./tools.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  registerDiagnosticTools(server);

  return server;
}
