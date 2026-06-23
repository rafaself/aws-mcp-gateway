import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { LOGS_MAX_EVENTS, LOGS_MAX_HOURS } from "../../../security/limits.js";
import { resolveApplicationProfileForTool } from "../../../profiles/index.js";
import { summarizeApplicationLogsInput } from "../../audit/tool-input.js";
import { buildApplicationLogs } from "../composition/application-ops/sections.js";
import { buildApplicationOpsContext, profileSummary } from "../composition/application-ops/types.js";
import {
  getApplicationLogsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  applicationProfileIdInputSchema,
  APPLICATION_OPS_COST_CONTROL,
  APPLICATION_OPS_LOGS_AWS,
  APPLICATION_OPS_SAFETY,
} from "./application-ops-shared.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

const getApplicationLogsInputSchema = applicationProfileIdInputSchema.extend({
  hours: z
    .number()
    .int()
    .min(1)
    .max(LOGS_MAX_HOURS)
    .optional()
    .describe(`Lookback hours (1–${LOGS_MAX_HOURS}, default 1).`),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LOGS_MAX_EVENTS)
    .optional()
    .describe(`Maximum events (1–${LOGS_MAX_EVENTS}, default 20).`),
});

type GetApplicationLogsInput = z.infer<typeof getApplicationLogsInputSchema>;

export function createGetApplicationLogsToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetApplicationLogsInput> {
  return {
    name: "get_application_logs",
    title: PUBLIC_TOOL_TITLES.get_application_logs,
    description:
      "Returns recent error log events for a profile-configured CloudWatch log group. Requires explicit profileId.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: getApplicationLogsInputSchema,
    outputSchema: getApplicationLogsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "logs", "cloudwatch", "errors", "profile"],
      docsAnchor: "32-get_application_logs",
      inputSummary: "profileId (required), optional hours and limit.",
      awsService: "logs",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      ...APPLICATION_OPS_LOGS_AWS,
      regionMode: "single-region",
      readonly: true,
    },
    safety: APPLICATION_OPS_SAFETY,
    costControl: {
      ...APPLICATION_OPS_COST_CONTROL,
      maxLookbackHours: LOGS_MAX_HOURS,
      maxResultCount: LOGS_MAX_EVENTS,
    },
    audit: {
      awsService: "logs",
      getRegion: () => ctx.region,
      sanitizeInput: (args) => summarizeApplicationLogsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetApplicationLogsInput) => {
      const profile = await resolveApplicationProfileForTool(ctx, args.profileId);
      const ops = buildApplicationOpsContext(ctx, profile);
      const logs = await buildApplicationLogs(ops, {
        hours: args.hours,
        limit: args.limit,
      });
      const structuredContent = { profile: profileSummary(profile), logs };
      const text = logs.status === "skipped"
        ? `No log group configured for profile ${profile.id}.`
        : `Application logs collected for ${profile.displayName} (${profile.id}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
