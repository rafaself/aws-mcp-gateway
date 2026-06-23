import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import {
  buildApplicationOpsContext,
} from "../composition/application-ops/types.js";
import {
  buildEnvironmentOverview,
} from "../composition/application-ops/sections.js";
import { formatEnvironmentOverviewText } from "../composition/application-ops/format.js";
import {
  getApplicationEnvironmentOverviewOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_OVERVIEW_ACTIONS,
  APPLICATION_OPS_OVERVIEW_CAPABILITIES,
  APPLICATION_OPS_OVERVIEW_SERVICES,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationEnvironmentOverviewToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_environment_overview",
    title: PUBLIC_TOOL_TITLES.get_application_environment_overview,
    description:
      "Returns a normalized application environment overview by composing configured profile resource blocks. " +
      "Requires an explicit profileId from list_application_profiles.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationEnvironmentOverviewOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "profile", "overview", "environment", "operations"],
      docsAnchor: "29-get_application_environment_overview",
      inputSummary: "profileId (required).",
      awsService: "ecs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: [...APPLICATION_OPS_OVERVIEW_SERVICES],
      actions: [...APPLICATION_OPS_OVERVIEW_ACTIONS],
      capabilities: [...APPLICATION_OPS_OVERVIEW_CAPABILITIES],
      regionMode: "single-region",
      readonly: true,
    },
    safety: APPLICATION_OPS_SAFETY,
    costControl: {
      ...APPLICATION_OPS_COST_CONTROL,
      maxRegions: 1,
    },
    audit: {
      awsService: "ecs",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const result = await buildEnvironmentOverview(ops);
      const text = formatEnvironmentOverviewText(result);

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: result,
      };
    },
  };
}
