import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { searchCatalog } from "../chatgpt/catalog.js";
import { safeMcpHandler, chatgptStructuredResult } from "./response.js";
import {
  chatgptSearchInputSchema,
  chatgptSearchOutputSchema,
  chatgptSearchToolDescriptor,
} from "./descriptor.js";

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

function resolveResourceUrl(ctx: GatewayContext): string {
  return ctx.mcpResourceUrl ?? DEFAULT_RESOURCE_URL;
}

export function registerSearchTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "search",
    chatgptSearchToolDescriptor({
      title: "Search AWS MCP tools",
      description:
        "Search read-only AWS MCP tools exposed by this gateway (cost, EC2, CloudWatch, logs). " +
        "Use fetch with a result id for full tool details.",
      inputSchema: chatgptSearchInputSchema,
      outputSchema: chatgptSearchOutputSchema,
    }),
    safeMcpHandler({ toolName: "search" }, async (args) => {
      const payload = searchCatalog(args.query, resolveResourceUrl(ctx));
      return chatgptStructuredResult(payload);
    }),
  );
}
