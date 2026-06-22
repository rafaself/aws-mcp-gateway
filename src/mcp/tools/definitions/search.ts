import type { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { searchCatalog } from "../../chatgpt/catalog.js";
import { sanitizeNoInput } from "../../audit/tool-input.js";
import { chatgptStructuredResult } from "../response.js";
import {
  chatgptSearchInputSchema,
  chatgptSearchOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
  type AnyToolManifest,
  type AwsCapabilityId,
} from "../manifest.js";
import {
  buildToolRegistryState,
  getChatGptCatalogEntries,
  manifestToGatewayDefinitionForContext,
  type GatewayToolDefinition,
} from "../registry.js";

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

type SearchInput = z.infer<typeof chatgptSearchInputSchema>;

const CORE_SAFETY = {
  riskLevel: "read-only" as const,
  cacheTtlSeconds: 0,
  timeoutMs: 5000,
  costClass: "none" as const,
};

const CORE_COST_CONTROL = {
  class: "free" as const,
  requiresCache: false,
  timeoutMs: 5000,
};

const CORE_AWS = {
  services: [] as string[],
  actions: [] as string[],
  capabilities: [] as AwsCapabilityId[],
  regionMode: "none" as const,
  readonly: true as const,
};

function resolveResourceUrl(ctx: GatewayContext): string {
  return ctx.mcpResourceUrl ?? DEFAULT_RESOURCE_URL;
}

function catalogEntriesForContext(ctx: GatewayContext) {
  const { registry, policyContext } = buildToolRegistryState(ctx);
  return getChatGptCatalogEntries(registry, policyContext.enabledToolNames);
}

export function createSearchToolManifest(ctx: GatewayContext): ToolManifest<SearchInput> {
  return {
    name: "search",
    title: PUBLIC_TOOL_TITLES.search,
    description:
      "Search read-only AWS MCP tools exposed by this gateway (cost, EC2, CloudWatch, logs). " +
      "Use fetch with a result id for full tool details.",
    pack: "core",
    lifecycle: "stable",
    inputSchema: chatgptSearchInputSchema,
    outputSchema: chatgptSearchOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: CORE_AWS,
    safety: CORE_SAFETY,
    costControl: CORE_COST_CONTROL,
    audit: { sanitizeInput: sanitizeNoInput },
    descriptorKind: "chatgpt-discovery",
    handler: async (args: SearchInput) => {
      const payload = searchCatalog(
        args.query,
        resolveResourceUrl(ctx),
        catalogEntriesForContext(ctx),
      );
      return chatgptStructuredResult(payload);
    },
  };
}

export function createSearchToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(ctx, createSearchToolManifest(ctx) as AnyToolManifest);
}
