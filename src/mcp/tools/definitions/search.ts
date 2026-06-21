import type { GatewayContext } from "../../../config/context.js";
import { searchCatalog } from "../../chatgpt/catalog.js";
import { getChatGptCatalogEntries } from "../registry.js";
import { safeMcpHandler, chatgptStructuredResult } from "../response.js";
import {
  chatgptSearchInputSchema,
  chatgptSearchOutputSchema,
  chatgptDiscoveryToolDescriptor,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import type { GatewayToolDefinition } from "../registry.js";
import { createStatusToolDefinition } from "./status.js";
import { createCostSummaryToolDefinition } from "./cost-summary.js";
import { createCostByServiceToolDefinition } from "./cost-by-service.js";
import { createListEc2InstancesToolDefinition } from "./list-ec2-instances.js";
import { createGetCloudwatchAlarmsToolDefinition } from "./get-cloudwatch-alarms.js";
import { createGetRecentLogErrorsToolDefinition } from "./get-recent-log-errors.js";
import type { z } from "zod";

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

type SearchInput = z.infer<typeof chatgptSearchInputSchema>;

function resolveResourceUrl(ctx: GatewayContext): string {
  return ctx.mcpResourceUrl ?? DEFAULT_RESOURCE_URL;
}

function catalogEntriesForContext(ctx: GatewayContext) {
  return getChatGptCatalogEntries([
    createStatusToolDefinition(ctx),
    createCostSummaryToolDefinition(ctx),
    createCostByServiceToolDefinition(ctx),
    createListEc2InstancesToolDefinition(ctx),
    createGetCloudwatchAlarmsToolDefinition(ctx),
    createGetRecentLogErrorsToolDefinition(ctx),
  ]);
}

export function createSearchToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return chatgptDiscoveryToolDescriptor({
    name: "search",
    title: PUBLIC_TOOL_TITLES.search,
    description:
      "Search read-only AWS MCP tools exposed by this gateway (cost, EC2, CloudWatch, logs). " +
      "Use fetch with a result id for full tool details.",
    inputSchema: chatgptSearchInputSchema,
    outputSchema: chatgptSearchOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    handler: safeMcpHandler({ toolName: "search" }, async (args: SearchInput) => {
      const payload = searchCatalog(
        args.query,
        resolveResourceUrl(ctx),
        catalogEntriesForContext(ctx),
      );
      return chatgptStructuredResult(payload);
    }),
  });
}
