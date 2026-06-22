import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import {
  listInstances,
  VALID_INSTANCE_STATES,
  type Ec2InstanceState,
} from "../../../aws/ec2/index.js";
import { summarizeRegionListInput } from "../../audit/tool-input.js";
import {
  listEc2InstancesOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  manifestToGatewayDefinition,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { buildToolPolicyContext } from "../policy.js";
import type { GatewayToolDefinition } from "../registry.js";

const listEc2InstancesInputSchema = z.object({
  regions: z
    .array(z.string())
    .optional()
    .describe("AWS regions to query (defaults to all allowed regions)."),
  states: z
    .array(z.enum([...VALID_INSTANCE_STATES] as [Ec2InstanceState, ...Ec2InstanceState[]]))
    .optional()
    .describe("Filter by instance states."),
});

type ListEc2InstancesInput = z.infer<typeof listEc2InstancesInputSchema>;

export function createListEc2InstancesToolManifest(
  ctx: GatewayContext,
): ToolManifest<ListEc2InstancesInput> {
  return {
    name: "list_ec2_instances",
    title: PUBLIC_TOOL_TITLES.list_ec2_instances,
    description: "Lists EC2 instances across regions with optional state and region filtering.",
    pack: "inventory",
    lifecycle: "stable",
    inputSchema: listEc2InstancesInputSchema,
    outputSchema: listEc2InstancesOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ec2", "instances", "compute", "servers", "inventory", "vms"],
      docsAnchor: "4-list_ec2_instances",
      inputSummary: "Optional regions[] limited to gateway allowlist.",
      awsService: "ec2",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ec2"],
      actions: ["ec2:DescribeInstances"],
      regionMode: "bounded-multi-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 300,
      timeoutMs: 30000,
      costClass: "cached-read",
    },
    audit: {
      awsService: "ec2",
      sanitizeInput: (args) => summarizeRegionListInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ListEc2InstancesInput) => {
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
    },
  };
}

export function createListEc2InstancesToolDefinition(ctx: GatewayContext): GatewayToolDefinition {
  const manifest = createListEc2InstancesToolManifest(ctx);
  const policyContext = buildToolPolicyContext(ctx, [manifest as AnyToolManifest]);
  return manifestToGatewayDefinition(manifest, policyContext);
}
