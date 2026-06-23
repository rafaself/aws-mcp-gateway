import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listApplicationProfiles, isProfileConfigAvailable } from "../../../profiles/index.js";
import { sanitizeNoInput } from "../../audit/tool-input.js";
import {
  listApplicationProfilesOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import { DEFAULT_AUTH_SCOPES, type ToolManifest } from "../manifest.js";

const listApplicationProfilesInputSchema = z.object({});

export function createListApplicationProfilesToolManifest(
  ctx: GatewayContext,
): ToolManifest {
  return {
    name: "list_application_profiles",
    title: PUBLIC_TOOL_TITLES.list_application_profiles,
    description:
      "Returns safe application profile metadata from KV-backed profiles. " +
      "Does not return secrets or full profile internals. " +
      "Use profileId from this list for application-ops tools.",
    pack: "application-ops",
    lifecycle: "stable",
    inputSchema: listApplicationProfilesInputSchema,
    outputSchema: listApplicationProfilesOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["application", "profile", "environment", "operations", "context"],
      docsAnchor: "28-list_application_profiles",
      inputSummary: "No parameters.",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: [],
      actions: [],
      capabilities: [],
      regionMode: "none",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 60,
      timeoutMs: 10000,
      costClass: "none",
    },
    costControl: {
      class: "free",
      requiresCache: false,
      timeoutMs: 10000,
    },
    audit: { sanitizeInput: sanitizeNoInput },
    descriptorKind: "local-status",
    handler: async () => {
      const listResult = await listApplicationProfiles(ctx);
      const profiles = await Promise.all(
        listResult.profiles.map(async (profile) => ({
          ...profile,
          profileConfigAvailable: await isProfileConfigAvailable(ctx, profile.id),
        })),
      );

      const structuredContent = {
        storeStatus: listResult.status,
        profiles,
      };

      const text =
        listResult.status === "disabled"
          ? "Application profiles are not configured."
          : `Found ${profiles.length} application profile(s) (store: ${listResult.status}).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent,
      };
    },
  };
}
