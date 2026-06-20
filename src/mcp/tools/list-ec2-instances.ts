import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../context.js";
import { listInstances } from "../../aws/ec2.js";
import { safeMcpHandler } from "./response.js";

export function registerListEc2InstancesTool(server: McpServer, ctx: GatewayContext): void {
  server.registerTool(
    "list_ec2_instances",
    {
      description: "Lists EC2 instances across regions with optional state and region filtering.",
      inputSchema: z.object({
        regions: z
          .array(z.string())
          .optional()
          .describe("AWS regions to query (defaults to all allowed regions)."),
        states: z
          .array(
            z.enum([
              "pending",
              "running",
              "stopping",
              "stopped",
              "shutting-down",
              "terminated",
            ]),
          )
          .optional()
          .describe("Filter by instance states."),
      }),
    },
    safeMcpHandler(
      {
        toolName: "list_ec2_instances",
        awsService: "ec2",
        sanitizeInput: (args) => ({
          regionCount: args.regions?.length ?? "all",
          stateFilter: args.states,
        }),
      },
      async (args) => {
      const instances = await listInstances(
        {
          regions: args.regions,
          stateFilter: args.states,
        },
        ctx.allowedRegions,
        ctx.credentials,
        ctx.cache,
      );

      const resultRegions = [...new Set(instances.map((i) => i.region))].sort();
      const count = instances.length;

      const instanceEntries = instances.map((inst) => ({
        instanceId: inst.instanceId,
        region: inst.region,
        state: inst.state,
        instanceType: inst.instanceType,
        name: inst.name,
      }));

      const countsByState = instances.reduce<Record<string, number>>((acc, i) => {
        acc[i.state] = (acc[i.state] || 0) + 1;
        return acc;
      }, {});

      const stateLines = Object.entries(countsByState)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([state, n]) => `${state}: ${n}`);

      const regionLines = resultRegions.map(
        (r) => `${r}: ${instances.filter((i) => i.region === r).length}`,
      );

      const text =
        `Found ${count} EC2 instance(s) across ${resultRegions.length} region(s).\n` +
        `By state:\n${stateLines.join("\n")}\n` +
        `By region:\n${regionLines.join("\n")}`;

      return {
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
        structuredContent: {
          regions: resultRegions,
          count,
          instances: instanceEntries,
        },
      };
    }),
  );
}
