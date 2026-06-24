import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getRulesStatus } from "../../../aws/eventbridge/index.js";
import { EVENTBRIDGE_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeEventBridgeRulesStatusInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getEventBridgeRulesStatusOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getEventBridgeRulesStatusInputSchema = z.object({
  ruleNamePrefix: z.string().optional().describe("Optional EventBridge rule name prefix filter."),
  scheduleNamePrefix: z
    .string()
    .optional()
    .describe("Optional EventBridge Scheduler schedule name prefix filter."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION)."),
  limit: z
    .number()
    .int()
    .optional()
    .describe("Maximum rules and schedules to return (default 25, max 50)."),
});

type GetEventBridgeRulesStatusInput = z.infer<typeof getEventBridgeRulesStatusInputSchema>;

export function createGetEventBridgeRulesStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetEventBridgeRulesStatusInput> {
  return {
    name: "get_eventbridge_rules_status",
    title: PUBLIC_TOOL_TITLES.get_eventbridge_rules_status,
    description:
      "Returns EventBridge rule and Scheduler schedule status with safe target summaries. " +
      "Raw target input payloads are never returned. Uses default gateway credentials only.",
    pack: "security",
    lifecycle: "stable",
    inputSchema: getEventBridgeRulesStatusInputSchema,
    outputSchema: getEventBridgeRulesStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["eventbridge", "scheduler", "rules", "schedules", "automation"],
      docsAnchor: "26-get_eventbridge_rules_status",
      inputSummary: "optional prefixes, region, limit.",
      awsService: "events",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["events", "scheduler"],
      actions: [
        "events:ListRules",
        "events:DescribeRule",
        "events:ListTargetsByRule",
        "scheduler:ListSchedules",
        "scheduler:GetSchedule",
      ],
      capabilities: [
        "events:ListRules",
        "events:DescribeRule",
        "events:ListTargetsByRule",
        "scheduler:ListSchedules",
        "scheduler:GetSchedule",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: EVENTBRIDGE_CACHE_TTL_SECONDS,
      timeoutMs: 30000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 30000,
      minCacheTtlSeconds: EVENTBRIDGE_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "events",
      getRegion: (args: GetEventBridgeRulesStatusInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeEventBridgeRulesStatusInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetEventBridgeRulesStatusInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const status = await getRulesStatus(
        {
          region,
          ruleNamePrefix: args.ruleNamePrefix,
          scheduleNamePrefix: args.scheduleNamePrefix,
          limit: args.limit,
        },
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text =
        `EventBridge status (${region}): ${status.rules.length} rules, ` +
        `${status.schedules.length} schedules.` +
        (status.truncated ? " Results truncated to limit." : "");

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...status },
      };
    },
  };
}
