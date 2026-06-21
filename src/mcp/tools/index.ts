import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerStatusTool } from "./status.js";
import { registerCostSummaryTool } from "./cost-summary.js";
import { registerCostByServiceTool } from "./cost-by-service.js";
import { registerListEc2InstancesTool } from "./list-ec2-instances.js";
import { registerGetCloudwatchAlarmsTool } from "./get-cloudwatch-alarms.js";
import { registerGetRecentLogErrorsTool } from "./get-recent-log-errors.js";
import { registerSearchTool } from "./search.js";
import { registerFetchTool } from "./fetch.js";

export function registerTools(server: McpServer, ctx: GatewayContext): void {
  registerSearchTool(server, ctx);
  registerFetchTool(server, ctx);
  registerStatusTool(server);
  registerCostSummaryTool(server, ctx);
  registerCostByServiceTool(server, ctx);
  registerListEc2InstancesTool(server, ctx);
  registerGetCloudwatchAlarmsTool(server, ctx);
  registerGetRecentLogErrorsTool(server, ctx);
}
