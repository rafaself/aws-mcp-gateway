import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import {
  gatewayStatusOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import { sanitizeNoInput } from "../../audit/tool-input.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest, type AwsCapabilityId } from "../manifest.js";
import { manifestToGatewayDefinitionForContext, type GatewayToolDefinition } from "../registry.js";

const statusInputSchema = z.object({});

const CORE_SAFETY = {
  riskLevel: "read-only" as const,
  cacheTtlSeconds: 0,
  timeoutMs: 5000,
  costClass: "none" as const,
};

const CORE_AWS = {
  services: [] as string[],
  actions: [] as string[],
  capabilities: [] as AwsCapabilityId[],
  regionMode: "none" as const,
  readonly: true as const,
};

export function createStatusToolManifest(_ctx: GatewayContext): ToolManifest {
  return {
    name: "get_gateway_status",
    title: PUBLIC_TOOL_TITLES.get_gateway_status,
    description:
      "Returns the current gateway status. Use this to verify the MCP server is running.",
    pack: "core",
    lifecycle: "stable",
    inputSchema: statusInputSchema,
    outputSchema: gatewayStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["gateway", "status", "health", "ping", "regions"],
      docsAnchor: "1-get_gateway_status",
      inputSummary: "No parameters.",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: CORE_AWS,
    safety: CORE_SAFETY,
    audit: { sanitizeInput: sanitizeNoInput },
    descriptorKind: "local-status",
    handler: async () => {
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
    },
  };
}

export function createStatusToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(ctx, createStatusToolManifest(ctx));
}
