import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../config/context.js";
import { registerTools } from "./tools/index.js";
import {
  buildPublicToolList,
  registerPublicToolsListHandler,
} from "./list-compat.js";

export { buildPublicToolList } from "./list-compat.js";

/** @deprecated Use buildPublicToolList for contract tests. */
export function listToolsSnapshot(server: McpServer): ReturnType<typeof buildPublicToolList> {
  return buildPublicToolList(server);
}

export function createServer(ctx: GatewayContext): McpServer {
  const server = new McpServer({
    name: "aws-mcp-gateway",
    version: "0.1.0",
  });

  registerTools(server, ctx);
  registerPublicToolsListHandler(server);

  return server;
}
