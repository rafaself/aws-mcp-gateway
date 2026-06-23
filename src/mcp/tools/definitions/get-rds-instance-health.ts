import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getInstanceHealth } from "../../../aws/rds/index.js";
import { RDS_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeRdsInstanceHealthInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  rdsInstanceHealthOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const rdsInstanceHealthInputSchema = z.object({
  dbInstanceIdentifier: z
    .string()
    .describe("RDS DB instance identifier (direct resource name; profiles are not required)."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
});

type RdsInstanceHealthInput = z.infer<typeof rdsInstanceHealthInputSchema>;

export function createGetRdsInstanceHealthToolManifest(
  ctx: GatewayContext,
): ToolManifest<RdsInstanceHealthInput> {
  return {
    name: "get_rds_instance_health",
    title: PUBLIC_TOOL_TITLES.get_rds_instance_health,
    description:
      "Returns normalized RDS instance health and posture for any DB instance in allowed regions. No application profile is required.",
    pack: "database",
    lifecycle: "stable",
    inputSchema: rdsInstanceHealthInputSchema,
    outputSchema: rdsInstanceHealthOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["rds", "database", "postgres", "mysql", "health", "instance"],
      docsAnchor: "18-get_rds_instance_health",
      inputSummary: "dbInstanceIdentifier, optional region.",
      awsService: "rds",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["rds"],
      actions: ["rds:DescribeDBInstances", "rds:DescribeDBSubnetGroups"],
      capabilities: ["rds:DescribeDBInstances", "rds:DescribeDBSubnetGroups"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: RDS_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 15000,
      minCacheTtlSeconds: RDS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "rds",
      getRegion: (args: RdsInstanceHealthInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeRdsInstanceHealthInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: RdsInstanceHealthInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const health = await getInstanceHealth(
        args.dbInstanceIdentifier,
        region,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text =
        `RDS instance ${health.dbInstanceIdentifier} (${region}): status ${health.status}, ` +
        `engine ${health.engine} ${health.engineVersion}, class ${health.instanceClass}.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...health },
      };
    },
  };
}
