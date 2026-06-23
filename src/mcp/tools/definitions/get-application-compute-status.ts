import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import { buildComputeStatus } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationComputeStatusOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COMPUTE_AWS,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationComputeStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_compute_status",
    title: PUBLIC_TOOL_TITLES.get_application_compute_status,
    description:
      "Returns ECS compute status for a configured application profile. Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationComputeStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "ecs", "compute", "service", "profile"],
      docsAnchor: "30-get_application_compute_status",
      inputSummary: "profileId (required).",
      awsService: "ecs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      ...APPLICATION_OPS_COMPUTE_AWS,
      regionMode: "single-region",
      readonly: true,
    },
    safety: APPLICATION_OPS_SAFETY,
    costControl: APPLICATION_OPS_COST_CONTROL,
    audit: {
      awsService: "ecs",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const compute = await buildComputeStatus(ops);
      const structuredContent = { profile: profileSummary(profile), compute };
      const text = compute.status === "skipped"
        ? `No ECS block configured for profile ${profile.id}.`
        : `Compute status collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
