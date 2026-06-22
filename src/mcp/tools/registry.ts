import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { GatewayContext } from "../../config/context.js";
import type { ToolSecurityScheme } from "./descriptor.js";
import type { McpSuccessResult } from "./response.js";
import type { mcpErrorResult } from "../../errors/public-error.js";
import { manifestToGatewayDefinition, type AnyToolManifest } from "./manifest.js";
import { buildToolPolicyContext } from "./policy.js";
import {
  createCostByServiceToolManifest,
  createCostSummaryToolManifest,
  createFetchToolManifest,
  createGetCloudwatchAlarmsToolManifest,
  createGetRecentLogErrorsToolManifest,
  createListEc2InstancesToolManifest,
  createSearchToolManifest,
  createStatusToolManifest,
} from "./definitions/index.js";

export type GatewayToolCatalogMetadata = {
  keywords: string[];
  docsAnchor: string;
  inputSummary: string;
  awsService?: string;
};

export type GatewayToolVisibility = {
  mcp: boolean;
  chatgpt: boolean;
};

export type GatewayToolHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
) => Promise<McpSuccessResult | ReturnType<typeof mcpErrorResult>>;

export type GatewayToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema?: z.ZodTypeAny | z.ZodRawShape;
  outputSchema?: z.ZodTypeAny;
  annotations: ToolAnnotations;
  securitySchemes: ToolSecurityScheme[];
  _meta?: Record<string, unknown>;
  visibility: GatewayToolVisibility;
  catalog?: GatewayToolCatalogMetadata;
  handler: GatewayToolHandler;
};

export type ChatGptCatalogEntry = {
  toolName: string;
  title: string;
  description: string;
  keywords: string[];
  docsAnchor: string;
  inputSummary: string;
  awsService?: string;
};

export const PUBLIC_TOOL_NAMES = [
  "search",
  "fetch",
  "get_gateway_status",
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];

export function createToolManifests(ctx: GatewayContext): AnyToolManifest[] {
  return [
    createSearchToolManifest(ctx),
    createFetchToolManifest(ctx),
    createStatusToolManifest(ctx),
    createCostSummaryToolManifest(ctx),
    createCostByServiceToolManifest(ctx),
    createListEc2InstancesToolManifest(ctx),
    createGetCloudwatchAlarmsToolManifest(ctx),
    createGetRecentLogErrorsToolManifest(ctx),
  ] as AnyToolManifest[];
}

export function createToolRegistry(ctx: GatewayContext): GatewayToolDefinition[] {
  const manifests = createToolManifests(ctx);
  const policyContext = buildToolPolicyContext(ctx, manifests);
  return manifests.map((manifest) => manifestToGatewayDefinition(manifest, policyContext));
}

export function getPublicTools(registry: GatewayToolDefinition[]): GatewayToolDefinition[] {
  return registry.filter((tool) => tool.visibility.mcp);
}

export function getChatGptCatalogEntries(registry: GatewayToolDefinition[]): ChatGptCatalogEntry[] {
  return registry
    .filter((tool) => tool.catalog !== undefined)
    .map((tool) => ({
      toolName: tool.name,
      title: tool.title,
      description: tool.description,
      keywords: tool.catalog!.keywords,
      docsAnchor: tool.catalog!.docsAnchor,
      inputSummary: tool.catalog!.inputSummary,
      awsService: tool.catalog!.awsService,
    }));
}

export function findToolDefinition(
  registry: GatewayToolDefinition[],
  name: string,
): GatewayToolDefinition | undefined {
  return registry.find((tool) => tool.name === name);
}
