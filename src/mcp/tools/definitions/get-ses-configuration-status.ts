import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getConfigurationStatus } from "../../../aws/ses/index.js";
import { SES_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeSesConfigurationStatusInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getSesConfigurationStatusOutputSchema,
} from "../descriptor.js";
import { resolveToolCredentials } from "../resolve-tool-credentials.js";
import { assumeRoleInputFields } from "../schemas/assume-role.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getSesConfigurationStatusInputSchema = z.object({
  configurationSetName: z
    .string()
    .describe("SES configuration set name."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION)."),
  ...assumeRoleInputFields,
});

type GetSesConfigurationStatusInput = z.infer<typeof getSesConfigurationStatusInputSchema>;

export function createGetSesConfigurationStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetSesConfigurationStatusInput> {
  return {
    name: "get_ses_configuration_status",
    title: PUBLIC_TOOL_TITLES.get_ses_configuration_status,
    description:
      "Returns SES configuration set status including sending enabled state, reputation metrics, " +
      "TLS policy, and event destination summaries. SNS destination ARNs are masked. " +
      "Supports optional AssumeRole for SES in another account.",
    pack: "security",
    lifecycle: "stable",
    inputSchema: getSesConfigurationStatusInputSchema,
    outputSchema: getSesConfigurationStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["ses", "email", "configuration", "posture", "security"],
      docsAnchor: "24-get_ses_configuration_status",
      inputSummary: "configurationSetName, optional region, optional roleArn.",
      awsService: "ses",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ses"],
      actions: ["ses:GetConfigurationSet", "ses:GetConfigurationSetEventDestinations"],
      capabilities: ["ses:GetConfigurationSet", "ses:GetConfigurationSetEventDestinations"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: SES_CACHE_TTL_SECONDS,
      timeoutMs: 20000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 20000,
      minCacheTtlSeconds: SES_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "ses",
      getRegion: (args: GetSesConfigurationStatusInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeSesConfigurationStatusInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetSesConfigurationStatusInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const credentials = await resolveToolCredentials(ctx, {
        roleArn: args.roleArn,
        externalId: args.externalId,
      });

      const status = await getConfigurationStatus(
        args.configurationSetName,
        region,
        credentials,
        ctx.cache,
        ctx.execution,
        { roleArn: args.roleArn },
      );

      const text = status.configurationSetExists
        ? `SES configuration set ${args.configurationSetName} (${region}): status collected.`
        : `SES configuration set ${args.configurationSetName} (${region}): not found.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...status },
      };
    },
  };
}
