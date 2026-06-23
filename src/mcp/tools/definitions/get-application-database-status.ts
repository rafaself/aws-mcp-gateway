import type { GatewayContext } from "../../../config/context.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationProfileInput } from "../../audit/tool-input.js";
import { buildDatabaseStatus } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationDatabaseStatusOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_SAFETY,
  type ApplicationProfileIdInput,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

export function createGetApplicationDatabaseStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<ApplicationProfileIdInput> {
  return {
    name: "get_application_database_status",
    title: PUBLIC_TOOL_TITLES.get_application_database_status,
    description:
      "Returns RDS database status for a configured application profile. Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: applicationProfileIdInputSchema,
    outputSchema: getApplicationDatabaseStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "rds", "database", "profile"],
      docsAnchor: "31-get_application_database_status",
      inputSummary: "profileId (required).",
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
    safety: APPLICATION_OPS_SAFETY,
    costControl: APPLICATION_OPS_COST_CONTROL,
    audit: {
      awsService: "rds",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationProfileInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ApplicationProfileIdInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const database = await buildDatabaseStatus(ops);
      const structuredContent = { profile: profileSummary(profile), database };
      const text = database.status === "skipped"
        ? `No RDS block configured for profile ${profile.id}.`
        : `Database status collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
