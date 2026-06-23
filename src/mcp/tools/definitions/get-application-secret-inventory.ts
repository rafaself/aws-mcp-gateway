import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import { buildSecretInventory } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationSecretInventoryOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationSecretInventoryToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_secret_inventory",
    title: PUBLIC_TOOL_TITLES.get_application_secret_inventory,
    description:
      "Returns SSM parameter inventory missing counts for a configured application profile. " +
      "Metadata only — never returns parameter values. Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationSecretInventoryOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "ssm", "secrets", "inventory", "profile"],
      docsAnchor: "33-get_application_secret_inventory",
      inputSummary: "profileId (required).",
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
    safety: APPLICATION_OPS_SAFETY,
    costControl: APPLICATION_OPS_COST_CONTROL,
    audit: {
      awsService: "ssm",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const ssm = await buildSecretInventory(ops);
      const structuredContent = { profile: profileSummary(profile), ssm };
      const text = ssm.status === "skipped"
        ? `No SSM inventory block configured for profile ${profile.id}.`
        : `SSM inventory collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
