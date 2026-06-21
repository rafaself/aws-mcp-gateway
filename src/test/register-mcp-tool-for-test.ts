import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../config/context.js";
import { registerToolOnServer } from "../mcp/tools/register.js";
import {
  createToolRegistry,
  findToolDefinition,
  type PublicToolName,
} from "../mcp/tools/registry.js";

export function registerMcpToolForTest(
  server: McpServer,
  ctx: GatewayContext,
  name: PublicToolName,
): void {
  const registry = createToolRegistry(ctx);
  const tool = findToolDefinition(registry, name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  registerToolOnServer(server, tool);
}
