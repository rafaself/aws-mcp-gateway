import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayToolDefinition } from "./registry.js";

function toRegisterToolConfig(tool: GatewayToolDefinition): Record<string, unknown> {
  const config: Record<string, unknown> = {
    title: tool.title,
    description: tool.description,
    annotations: tool.annotations,
    securitySchemes: tool.securitySchemes,
    _meta: {
      ...tool._meta,
      securitySchemes: tool.securitySchemes,
    },
  };

  if (tool.inputSchema !== undefined) {
    config.inputSchema = tool.inputSchema;
  }

  if (tool.outputSchema !== undefined) {
    config.outputSchema = tool.outputSchema;
  }

  return config;
}

export function registerToolOnServer(server: McpServer, tool: GatewayToolDefinition): void {
  server.registerTool(tool.name, toRegisterToolConfig(tool), tool.handler);
}

export function registerToolsFromRegistry(
  server: McpServer,
  registry: GatewayToolDefinition[],
): void {
  for (const tool of registry) {
    if (tool.visibility.mcp) {
      registerToolOnServer(server, tool);
    }
  }
}
