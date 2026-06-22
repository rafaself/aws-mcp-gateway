import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listFunctions } from "../../../aws/lambda/index.js";
import { LAMBDA_MAX_FUNCTIONS, LAMBDA_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { summarizeRegionListInput } from "../../audit/tool-input.js";
import {
  listLambdaFunctionsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const listLambdaFunctionsInputSchema = z.object({
  regions: z
    .array(z.string())
    .optional()
    .describe("AWS regions to query (defaults to all allowed regions)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LAMBDA_MAX_FUNCTIONS)
    .optional()
    .describe(`Maximum number of functions to return (1–${LAMBDA_MAX_FUNCTIONS}).`),
});

type ListLambdaFunctionsInput = z.infer<typeof listLambdaFunctionsInputSchema>;

export function createListLambdaFunctionsToolManifest(
  ctx: GatewayContext,
): ToolManifest<ListLambdaFunctionsInput> {
  return {
    name: "list_lambda_functions",
    title: PUBLIC_TOOL_TITLES.list_lambda_functions,
    description: "Lists Lambda functions across regions with optional region and result limiting.",
    pack: "inventory",
    lifecycle: "stable",
    inputSchema: listLambdaFunctionsInputSchema,
    outputSchema: listLambdaFunctionsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["lambda", "functions", "serverless", "inventory"],
      docsAnchor: "7-list_lambda_functions",
      inputSummary: "Optional regions[] and limit.",
      awsService: "lambda",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["lambda"],
      actions: ["lambda:ListFunctions"],
      capabilities: ["lambda:ListFunctions"],
      regionMode: "bounded-multi-region",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: LAMBDA_CACHE_TTL_SECONDS,
      timeoutMs: 30000,
      costClass: "cached-read",
    },
    costControl: {
      class: "fanout-sensitive",
      requiresCache: true,
      timeoutMs: 30000,
      maxRegions: ctx.allowedRegions.length,
      maxResultCount: LAMBDA_MAX_FUNCTIONS,
      minCacheTtlSeconds: LAMBDA_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "lambda",
      sanitizeInput: (args) => summarizeRegionListInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ListLambdaFunctionsInput) => {
      const functions = await listFunctions(
        { regions: args.regions, limit: args.limit },
        ctx.allowedRegions,
        ctx.credentials,
        ctx.cache,
      );

      const resultRegions = [...new Set(functions.map((f) => f.region))].sort();
      const count = functions.length;

      const functionEntries = functions.map((fn) => ({
        functionName: fn.functionName,
        region: fn.region,
        runtime: fn.runtime,
        state: fn.state,
      }));

      const regionLines = resultRegions.map(
        (r) => `${r}: ${functions.filter((f) => f.region === r).length}`,
      );

      const text =
        `Found ${count} Lambda function(s) across ${resultRegions.length} region(s).\n` +
        `By region:\n${regionLines.join("\n")}`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          regions: resultRegions,
          count,
          functions: functionEntries,
        },
      };
    },
  };
}
