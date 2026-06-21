import type { GatewayContext } from "../../../config/context.js";
import { safeMcpHandler } from "../response.js";
import { OAUTH_SECURITY_SCHEMES, STATUS_ANNOTATIONS } from "../descriptor.js";
import type { GatewayToolDefinition } from "../registry.js";

export function createStatusToolDefinition(_ctx: GatewayContext): GatewayToolDefinition {
  const securitySchemes = [...OAUTH_SECURITY_SCHEMES];

  return {
    name: "get_gateway_status",
    title: "Gateway status",
    description:
      "Returns the current gateway status. Use this to verify the MCP server is running.",
    annotations: STATUS_ANNOTATIONS,
    securitySchemes,
    _meta: { securitySchemes },
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["gateway", "status", "health", "ping", "regions"],
      docsAnchor: "1-get_gateway_status",
      inputSummary: "No parameters.",
    },
    handler: safeMcpHandler({ toolName: "get_gateway_status" }, async () => ({
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
    })),
  };
}
