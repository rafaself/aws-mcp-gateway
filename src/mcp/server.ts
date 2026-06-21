import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../config/context.js";
import { createToolRegistry } from "./tools/registry.js";
import { registerToolsFromRegistry } from "./tools/register.js";
import { registerPublicToolsListHandler } from "./tools/public-list.js";

export function createServer(ctx: GatewayContext): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  const registry = createToolRegistry(ctx);
  registerToolsFromRegistry(server, registry);
  registerPublicToolsListHandler(server, registry);

  return server;
}
