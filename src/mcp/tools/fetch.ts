import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GatewayError } from "../../errors/public-error.js";
import type { GatewayContext } from "../../config/context.js";
import { fetchCatalogEntry } from "../chatgpt/catalog.js";
import { safeMcpHandler, chatgptStructuredResult } from "./response.js";
import {
  chatgptFetchInputSchema,
  chatgptFetchOutputSchema,
  chatgptFetchToolDescriptor,
} from "./descriptor.js";

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

function resolveResourceUrl(ctx: GatewayContext): string {
  return ctx.mcpResourceUrl ?? DEFAULT_RESOURCE_URL;
}

function gatewayStatusSnapshot(ctx: GatewayContext): Record<string, unknown> {
  return {
    service: "aws-mcp-gateway",
    status: "ok",
    mode: "read-only",
    region: ctx.region,
    allowedRegions: ctx.allowedRegions,
  };
}

export function registerFetchTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "fetch",
    chatgptFetchToolDescriptor({
      title: "Fetch AWS MCP tool details",
      description:
        "Retrieve full details for a search result id, including how to invoke the underlying read-only AWS MCP tool.",
      inputSchema: chatgptFetchInputSchema,
      outputSchema: chatgptFetchOutputSchema,
    }),
    safeMcpHandler({ toolName: "fetch" }, async (args) => {
      const liveStatus =
        args.id === "tool/get_gateway_status" ? gatewayStatusSnapshot(ctx) : undefined;

      const payload = fetchCatalogEntry(args.id, resolveResourceUrl(ctx), liveStatus);
      if (!payload) {
        throw new GatewayError("validation_error", "Unknown catalog document id.");
      }

      return chatgptStructuredResult(payload);
    }),
  );
}
