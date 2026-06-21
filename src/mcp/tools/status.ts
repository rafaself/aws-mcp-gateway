import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safeMcpHandler } from "./response.js";
import { localStatusToolDescriptor } from "./descriptor.js";

export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    "get_gateway_status",
    localStatusToolDescriptor({
      description: "Returns the current gateway status. Use this to verify the MCP server is running.",
    }),
    safeMcpHandler(
      { toolName: "get_gateway_status" },
      async () => ({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              service: "aws-mcp-gateway",
              status: "ok",
              mode: "read-only",
            }),
          },
        ],
      }),
    ),
  );
}
