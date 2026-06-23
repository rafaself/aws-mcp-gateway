import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getTopicStatus } from "../../../aws/sns/index.js";
import { SNS_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { validateRegion } from "../../../security/regions.js";
import { summarizeSnsTopicStatusInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getSnsTopicStatusOutputSchema,
} from "../descriptor.js";
import { resolveToolCredentials } from "../resolve-tool-credentials.js";
import { assumeRoleInputFields } from "../schemas/assume-role.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getSnsTopicStatusInputSchema = z.object({
  topicName: z.string().optional().describe("SNS topic name (short name, not ARN)."),
  topicArn: z.string().optional().describe("SNS topic ARN."),
  region: z
    .string()
    .optional()
    .describe("AWS region (defaults to gateway AWS_REGION)."),
  ...assumeRoleInputFields,
});

type GetSnsTopicStatusInput = z.infer<typeof getSnsTopicStatusInputSchema>;

export function createGetSnsTopicStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetSnsTopicStatusInput> {
  return {
    name: "get_sns_topic_status",
    title: PUBLIC_TOOL_TITLES.get_sns_topic_status,
    description:
      "Returns SNS topic status including subscription count, protocols, confirmation state, " +
      "and masked subscription endpoints. Topic policy is summarized without exposing principals.",
    pack: "observability",
    lifecycle: "stable",
    inputSchema: getSnsTopicStatusInputSchema,
    outputSchema: getSnsTopicStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["sns", "topic", "alerting", "subscription", "notifications"],
      docsAnchor: "25-get_sns_topic_status",
      inputSummary: "topicName or topicArn, optional region, optional roleArn.",
      awsService: "sns",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["sns"],
      actions: ["sns:ListTopics", "sns:GetTopicAttributes", "sns:ListSubscriptionsByTopic"],
      capabilities: ["sns:ListTopics", "sns:GetTopicAttributes", "sns:ListSubscriptionsByTopic"],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: SNS_CACHE_TTL_SECONDS,
      timeoutMs: 20000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 20000,
      minCacheTtlSeconds: SNS_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "sns",
      getRegion: (args: GetSnsTopicStatusInput) => args.region ?? ctx.region,
      sanitizeInput: (args) => summarizeSnsTopicStatusInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetSnsTopicStatusInput) => {
      const region = args.region ?? ctx.region;
      validateRegion(region, ctx.allowedRegions);

      const credentials = await resolveToolCredentials(ctx, {
        roleArn: args.roleArn,
        externalId: args.externalId,
      });

      const status = await getTopicStatus(
        {
          topicName: args.topicName,
          topicArn: args.topicArn,
          region,
        },
        credentials,
        ctx.cache,
        ctx.execution,
        { roleArn: args.roleArn },
      );

      const text = status.topicExists
        ? `SNS topic ${status.topicName ?? args.topicArn} (${region}): ${status.subscriptionCount} subscriptions.`
        : `SNS topic (${region}): not found.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...status },
      };
    },
  };
}
