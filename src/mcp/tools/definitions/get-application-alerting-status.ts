import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import { buildAlertingStatus } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationAlertingStatusOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_ALERTING_AWS,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationAlertingStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_alerting_status",
    title: PUBLIC_TOOL_TITLES.get_application_alerting_status,
    description:
      "Returns SNS, EventBridge, and CloudWatch alarm summaries for a configured application profile. " +
      "Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationAlertingStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "sns", "eventbridge", "alarms", "alerting", "profile"],
      docsAnchor: "35-get_application_alerting_status",
      inputSummary: "profileId (required).",
      awsService: "sns",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      ...APPLICATION_OPS_ALERTING_AWS,
      regionMode: "single-region",
      readonly: true,
    },
    safety: APPLICATION_OPS_SAFETY,
    costControl: APPLICATION_OPS_COST_CONTROL,
    audit: {
      awsService: "sns",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const alerting = await buildAlertingStatus(ops, { includeRegionalAlarms: true });
      const structuredContent = { profile: profileSummary(profile), alerting };
      const text = alerting.status === "skipped"
        ? `No alerting blocks configured for profile ${profile.id}.`
        : `Alerting status collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
