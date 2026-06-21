import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { safeMcpHandler } from "../response.js";
import {
  gatewayStatusOutputSchema,
  localStatusToolDescriptor,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import type { GatewayToolDefinition } from "../registry.js";

const statusInputSchema = z.object({});

export function createStatusToolDefinition(_ctx: GatewayContext): GatewayToolDefinition {
  return localStatusToolDescriptor({
    name: "get_gateway_status",
    title: PUBLIC_TOOL_TITLES.get_gateway_status,
    description:
      "Returns the current gateway status. Use this to verify the MCP server is running.",
    inputSchema: statusInputSchema,
    outputSchema: gatewayStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["gateway", "status", "health", "ping", "regions"],
      docsAnchor: "1-get_gateway_status",
      inputSummary: "No parameters.",
    },
    handler: safeMcpHandler({ toolName: "get_gateway_status" }, async () => {
      const structuredContent = {
        service: "aws-mcp-gateway",
        status: "ok",
        mode: "read-only",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(structuredContent),
          },
        ],
        structuredContent,
      };
    }),
  });
}
