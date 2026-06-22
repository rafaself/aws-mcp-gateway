import type { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { GatewayError } from "../../../errors/public-error.js";
import { fetchCatalogEntry } from "../../chatgpt/catalog.js";
import { sanitizeNoInput } from "../../audit/tool-input.js";
import { chatgptStructuredResult } from "../response.js";
import {
  chatgptFetchInputSchema,
  chatgptFetchOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  manifestToGatewayDefinition,
  type ToolManifest,
} from "../manifest.js";
import { createToolRegistry, getChatGptCatalogEntries, type GatewayToolDefinition } from "../registry.js";

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

type FetchInput = z.infer<typeof chatgptFetchInputSchema>;

const CORE_SAFETY = {
  riskLevel: "read-only" as const,
  cacheTtlSeconds: 0,
  timeoutMs: 5000,
  costClass: "none" as const,
};

const CORE_AWS = {
  services: [] as string[],
  actions: [] as string[],
  regionMode: "none" as const,
  readonly: true as const,
};

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

function catalogEntriesForContext(ctx: GatewayContext) {
  return getChatGptCatalogEntries(createToolRegistry(ctx));
}

export function createFetchToolManifest(ctx: GatewayContext): ToolManifest<FetchInput> {
  return {
    name: "fetch",
    title: PUBLIC_TOOL_TITLES.fetch,
    description:
      "Retrieve full details for a search result id, including how to invoke the underlying read-only AWS MCP tool.",
    pack: "core",
    lifecycle: "stable",
    inputSchema: chatgptFetchInputSchema,
    outputSchema: chatgptFetchOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: CORE_AWS,
    safety: CORE_SAFETY,
    audit: { sanitizeInput: sanitizeNoInput },
    descriptorKind: "chatgpt-discovery",
    handler: async (args: FetchInput) => {
      const liveStatus =
        args.id === "tool/get_gateway_status" ? gatewayStatusSnapshot(ctx) : undefined;

      const payload = fetchCatalogEntry(
        args.id,
        resolveResourceUrl(ctx),
        catalogEntriesForContext(ctx),
        liveStatus,
      );
      if (!payload) {
        throw new GatewayError("validation_error", "Unknown catalog document id.");
      }

      return chatgptStructuredResult(payload);
    },
  };
}

export function createFetchToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return manifestToGatewayDefinition(createFetchToolManifest(ctx));
}
