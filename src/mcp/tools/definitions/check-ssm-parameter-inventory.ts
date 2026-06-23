import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { checkParameterInventory } from "../../../aws/ssm/index.js";
import { SSM_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeSsmParameterInventoryInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  checkSsmParameterInventoryOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const checkSsmParameterInventoryInputSchema = z.object({
  parameterPrefix: z
    .string()
    .describe(
      "SSM parameter path prefix (must start with '/'; profiles are not required).",
    ),
  requiredParameterNames: z
    .array(z.string())
    .min(1)
    .describe(
      "Relative parameter names to verify under the prefix (for example ['db/host', 'api/key']).",
    ),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION; must be in allowed regions)."),
});

type CheckSsmParameterInventoryInput = z.infer<typeof checkSsmParameterInventoryInputSchema>;

export function createCheckSsmParameterInventoryToolManifest(
  ctx: GatewayContext,
): ToolManifest<CheckSsmParameterInventoryInput> {
  return {
    name: "check_ssm_parameter_inventory",
    title: PUBLIC_TOOL_TITLES.check_ssm_parameter_inventory,
    description:
      "Verifies required SSM parameter names exist and returns metadata only (type, version, last modified). " +
      "Does not read or return parameter values. No application profile is required.",
    pack: "security",
    lifecycle: "stable",
    inputSchema: checkSsmParameterInventoryInputSchema,
    outputSchema: checkSsmParameterInventoryOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ssm", "parameter", "inventory", "secrets", "config", "security"],
      docsAnchor: "20-check_ssm_parameter_inventory",
      inputSummary: "parameterPrefix, requiredParameterNames, optional region.",
      awsService: "ssm",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ssm"],
      actions: ["ssm:DescribeParameters"],
      capabilities: ["ssm:DescribeParameters"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: SSM_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 15000,
      minCacheTtlSeconds: SSM_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ssm",
      getRegion: (args: CheckSsmParameterInventoryInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeSsmParameterInventoryInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: CheckSsmParameterInventoryInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const inventory = await checkParameterInventory(
        {
          parameterPrefix: args.parameterPrefix,
          requiredParameterNames: args.requiredParameterNames,
          region,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text =
        `SSM inventory for ${inventory.parameterPrefix} (${region}): ` +
        `${inventory.parameters.length - inventory.missingCount} found, ` +
        `${inventory.missingCount} missing.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...inventory },
      };
    },
  };
}
