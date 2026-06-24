import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { getBudgetStatus } from "../../../aws/budgets/index.js";
import { BUDGET_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { summarizeBudgetStatusInput } from "../../audit/tool-input.js";
import {
  PUBLIC_TOOL_TITLES,
  getBudgetStatusOutputSchema,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const getBudgetStatusInputSchema = z.object({
  budgetName: z.string().describe("AWS Budget name."),
  accountId: z
    .string()
    .describe("12-digit AWS account ID that owns the budget."),
});

type GetBudgetStatusInput = z.infer<typeof getBudgetStatusInputSchema>;

export function createGetBudgetStatusToolManifest(
  ctx: GatewayContext,
): ToolManifest<GetBudgetStatusInput> {
  return {
    name: "get_budget_status",
    title: PUBLIC_TOOL_TITLES.get_budget_status,
    description:
      "Returns AWS Budget status including limit, actual spend, notification thresholds, " +
      "and masked subscriber addresses. Uses default gateway credentials only.",
    pack: "cost",
    lifecycle: "stable",
    inputSchema: getBudgetStatusInputSchema,
    outputSchema: getBudgetStatusOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["budget", "cost", "spend", "forecast", "notifications"],
      docsAnchor: "27-get_budget_status",
      inputSummary: "budgetName, accountId.",
      awsService: "budgets",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["budgets"],
      actions: ["budgets:ViewBudget"],
      capabilities: [
        "budgets:DescribeBudgets",
        "budgets:DescribeNotificationsForBudget",
        "budgets:DescribeSubscribersForNotification",
      ],
      regionMode: "single-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: BUDGET_CACHE_TTL_SECONDS,
      timeoutMs: 20000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 20000,
      minCacheTtlSeconds: BUDGET_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "budgets",
      getRegion: () => "us-east-1",
      sanitizeInput: (args) => summarizeBudgetStatusInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: GetBudgetStatusInput) => {
      const status = await getBudgetStatus(
        args.budgetName,
        args.accountId,
        ctx.credentials,
        ctx.cache,
        ctx.execution,
      );

      const text = status.budgetExists
        ? `Budget ${args.budgetName} (${args.accountId}): limit ${status.limitAmount ?? "unknown"} ${status.limitUnit ?? ""}, actual ${status.actualSpend ?? "unknown"}.`
        : `Budget ${args.budgetName} (${args.accountId}): not found.`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { ...status },
      };
    },
  };
}
