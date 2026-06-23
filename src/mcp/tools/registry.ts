import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { GatewayContext } from "../../config/context.js";
import type { ToolSecurityScheme } from "./descriptor.js";
import type { McpSuccessResult } from "./response.js";
import type { mcpErrorResult } from "../../errors/public-error.js";
import { manifestToGatewayDefinition, type AnyToolManifest } from "./manifest.js";
import { buildToolPolicyContext, type ToolPolicyContext } from "./policy.js";
import { PUBLIC_TOOL_NAMES, type PublicToolName } from "../../config/tool-exposure.js";
import {
  createCostByServiceToolManifest,
  createCostSummaryToolManifest,
  createFetchToolManifest,
  createGetCloudwatchAlarmsToolManifest,
  createGetCloudwatchLogsToolManifest,
  createGetCloudwatchAlarmSummaryToolManifest,
  createGetRecentLogErrorsToolManifest,
  createListEc2InstancesToolManifest,
  createListLambdaFunctionsToolManifest,
  createListLogGroupsToolManifest,
  createListS3BucketsToolManifest,
  createSearchToolManifest,
  createStatusToolManifest,
  createAwsAccountOverviewToolManifest,
  createAwsCostOverviewToolManifest,
  createAwsObservabilityOverviewToolManifest,
  createGetEcsServiceHealthToolManifest,
  createListEcsTasksToolManifest,
  createGetRecentStoppedEcsTasksToolManifest,
  createGetRdsInstanceHealthToolManifest,
  createGetRdsMetricsToolManifest,
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

export { PUBLIC_TOOL_NAMES, type PublicToolName };

export function createToolManifests(ctx: GatewayContext): AnyToolManifest[] {
  return [
    createSearchToolManifest(ctx),
    createFetchToolManifest(ctx),
    createStatusToolManifest(ctx),
    createCostSummaryToolManifest(ctx),
    createCostByServiceToolManifest(ctx),
    createListEc2InstancesToolManifest(ctx),
    createGetCloudwatchAlarmsToolManifest(ctx),
    createGetCloudwatchLogsToolManifest(ctx),
    createGetCloudwatchAlarmSummaryToolManifest(ctx),
    createGetRecentLogErrorsToolManifest(ctx),
    createListLambdaFunctionsToolManifest(ctx),
    createListS3BucketsToolManifest(ctx),
    createListLogGroupsToolManifest(ctx),
    createAwsAccountOverviewToolManifest(ctx),
    createAwsCostOverviewToolManifest(ctx),
    createAwsObservabilityOverviewToolManifest(ctx),
    createGetEcsServiceHealthToolManifest(ctx),
    createListEcsTasksToolManifest(ctx),
    createGetRecentStoppedEcsTasksToolManifest(ctx),
    createGetRdsInstanceHealthToolManifest(ctx),
    createGetRdsMetricsToolManifest(ctx),
  ] as AnyToolManifest[];
}

export function createToolRegistry(ctx: GatewayContext): GatewayToolDefinition[] {
  const manifests = createToolManifests(ctx);
  const policyContext = buildToolPolicyContext(ctx, manifests);
  return manifests.map((manifest) => manifestToGatewayDefinition(manifest, policyContext, ctx));
}

export function buildToolRegistryState(ctx: GatewayContext): {
  manifests: AnyToolManifest[];
  policyContext: ToolPolicyContext;
  registry: GatewayToolDefinition[];
} {
  const manifests = createToolManifests(ctx);
  const policyContext = buildToolPolicyContext(ctx, manifests);
  const registry = manifests.map((manifest) => manifestToGatewayDefinition(manifest, policyContext, ctx));
  return { manifests, policyContext, registry };
}

export function getPublicTools(
  registry: GatewayToolDefinition[],
  enabledToolNames?: ReadonlySet<string>,
): GatewayToolDefinition[] {
  return registry.filter((tool) => {
    if (!tool.visibility.mcp) {
      return false;
    }
    if (enabledToolNames && !enabledToolNames.has(tool.name)) {
      return false;
    }
    return true;
  });
}

export function getChatGptCatalogEntries(
  registry: GatewayToolDefinition[],
  enabledToolNames?: ReadonlySet<string>,
): ChatGptCatalogEntry[] {
  return getPublicTools(registry, enabledToolNames)
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
