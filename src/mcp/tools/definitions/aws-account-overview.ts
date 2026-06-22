import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { summarizeAccountOverviewInput } from "../../audit/tool-input.js";
import {
  buildAccountOverview,
  formatAccountOverviewText,
  type AccountOverviewInclude,
} from "../composition/account-overview.js";
import {
  awsAccountOverviewOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
  type AnyToolManifest,
} from "../manifest.js";
import { manifestToGatewayDefinitionForContext, type GatewayToolDefinition } from "../registry.js";

const ACCOUNT_INCLUDE_OPTIONS = ["ec2", "lambda", "s3"] as const;

const awsAccountOverviewInputSchema = z.object({
  regions: z
    .array(z.string())
    .optional()
    .describe("AWS regions to query (defaults to all allowed regions)."),
  include: z
    .array(z.enum(ACCOUNT_INCLUDE_OPTIONS))
    .default(["ec2"])
    .describe("Inventory sections to include (defaults to ec2 only)."),
});

type AwsAccountOverviewInput = z.infer<typeof awsAccountOverviewInputSchema>;

export function createAwsAccountOverviewToolManifest(
  ctx: GatewayContext,
): ToolManifest<AwsAccountOverviewInput> {
  return {
    name: "aws_account_overview",
    title: PUBLIC_TOOL_TITLES.aws_account_overview,
    description:
      "Returns a bounded account resource overview by composing EC2, Lambda, and S3 inventory capabilities.",
    pack: "aggregates",
    lifecycle: "stable",
    inputSchema: awsAccountOverviewInputSchema,
    outputSchema: awsAccountOverviewOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["account", "overview", "inventory", "ec2", "lambda", "s3", "summary"],
      docsAnchor: "10-aws_account_overview",
      inputSummary: "Optional regions[] and include ec2, lambda, or s3 (default ec2).",
      awsService: "ec2",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["ec2", "lambda", "s3"],
      actions: ["ec2:DescribeInstances", "lambda:ListFunctions", "s3:ListAllMyBuckets"],
      capabilities: ["ec2:DescribeInstances", "lambda:ListFunctions", "s3:ListAllMyBuckets"],
      regionMode: "bounded-multi-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: 300,
      timeoutMs: 30000,
      costClass: "cached-read",
    },
    costControl: {
      class: "fanout-sensitive",
      requiresCache: true,
      timeoutMs: 30000,
      maxRegions: ctx.allowedRegions.length,
      minCacheTtlSeconds: 300,
    },
    audit: {
      awsService: "ec2",
      sanitizeInput: (args) => summarizeAccountOverviewInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: AwsAccountOverviewInput) => {
      const include = (args.include ?? ["ec2"]) as AccountOverviewInclude[];
      const result = await buildAccountOverview(ctx, args, include);

      return {
        content: [{ type: "text" as const, text: formatAccountOverviewText(result) }],
        structuredContent: result,
      };
    },
  };
}

export function createAwsAccountOverviewToolDefinition(
  ctx: GatewayContext,
): GatewayToolDefinition {
  return manifestToGatewayDefinitionForContext(
    ctx,
    createAwsAccountOverviewToolManifest(ctx) as AnyToolManifest,
  );
}
