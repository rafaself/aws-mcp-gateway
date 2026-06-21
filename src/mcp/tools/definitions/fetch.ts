import type { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { GatewayError } from "../../../errors/public-error.js";
import { fetchCatalogEntry } from "../../chatgpt/catalog.js";
import { getChatGptCatalogEntries } from "../registry.js";
import { safeMcpHandler, chatgptStructuredResult } from "../response.js";
import {
  chatgptFetchInputSchema,
  chatgptFetchOutputSchema,
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

const DEFAULT_RESOURCE_URL = "https://aws-mcp-gateway.local";

type FetchInput = z.infer<typeof chatgptFetchInputSchema>;

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
  return getChatGptCatalogEntries([
    createStatusToolDefinition(ctx),
    createCostSummaryToolDefinition(ctx),
    createCostByServiceToolDefinition(ctx),
    createListEc2InstancesToolDefinition(ctx),
    createGetCloudwatchAlarmsToolDefinition(ctx),
    createGetRecentLogErrorsToolDefinition(ctx),
  ]);
}

export function createFetchToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  return chatgptDiscoveryToolDescriptor({
    name: "fetch",
    title: PUBLIC_TOOL_TITLES.fetch,
    description:
      "Retrieve full details for a search result id, including how to invoke the underlying read-only AWS MCP tool.",
    inputSchema: chatgptFetchInputSchema,
    outputSchema: chatgptFetchOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    handler: safeMcpHandler({ toolName: "fetch" }, async (args: FetchInput) => {
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
    }),
  });
}
