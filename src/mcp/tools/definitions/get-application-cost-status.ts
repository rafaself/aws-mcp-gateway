import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import { buildCostStatus } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationCostStatusOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationCostStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_cost_status",
    title: PUBLIC_TOOL_TITLES.get_application_cost_status,
    description:
      "Returns AWS Budget status for a configured application profile. Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationCostStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "budget", "cost", "profile"],
      docsAnchor: "36-get_application_cost_status",
      inputSummary: "profileId (required).",
      awsService: "budgets",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["budgets"],
      actions: [
        "budgets:DescribeBudgets",
        "budgets:DescribeNotificationsForBudget",
        "budgets:DescribeSubscribersForNotification",
      ],
      capabilities: [
        "budgets:DescribeBudgets",
        "budgets:DescribeNotificationsForBudget",
        "budgets:DescribeSubscribersForNotification",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: APPLICATION_OPS_SAFETY,
    costControl: APPLICATION_OPS_COST_CONTROL,
    audit: {
      awsService: "budgets",
      getRegion: () => "us-east-1",
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const budget = await buildCostStatus(ops);
      const structuredContent = { profile: profileSummary(profile), budget };
      const text = budget.status === "skipped"
        ? `No budget block configured for profile ${profile.id}.`
        : `Budget status collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
