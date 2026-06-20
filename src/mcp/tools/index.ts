import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { registerStatusTool } from "./status.js";
import { registerCostSummaryTool } from "./cost-summary.js";
import { registerCostByServiceTool } from "./cost-by-service.js";

export function registerTools(server: McpServer, ctx: GatewayContext): void {
  registerStatusTool(server);
  registerCostSummaryTool(server, ctx);
  registerCostByServiceTool(server, ctx);
}
