import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { createToolRegistry } from "./registry.js";
import { registerToolsFromRegistry } from "./register.js";

export function registerTools(server: McpServer, ctx: GatewayContext): void {
  registerToolsFromRegistry(server, createToolRegistry(ctx));
}

export { registerToolByName } from "./register.js";
export { createToolRegistry, getChatGptCatalogEntries } from "./registry.js";
export { buildPublicToolList, PUBLIC_TOOL_LIST_FIELDS } from "./public-list.js";
