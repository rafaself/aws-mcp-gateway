import { z } from "zod";
import type { GatewayContext } from "../../../config/context.js";
import { listBuckets } from "../../../aws/s3/index.js";
import { S3_MAX_BUCKETS, S3_CACHE_TTL_SECONDS } from "../../../security/limits.js";
import { summarizeS3BucketsInput } from "../../audit/tool-input.js";
import {
  listS3BucketsOutputSchema,
  PUBLIC_TOOL_TITLES,
} from "../descriptor.js";
import {
  DEFAULT_AUTH_SCOPES,
  type ToolManifest,
} from "../manifest.js";

const listS3BucketsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(S3_MAX_BUCKETS)
    .optional()
    .describe(`Maximum number of buckets to return (1–${S3_MAX_BUCKETS}).`),
});

type ListS3BucketsInput = z.infer<typeof listS3BucketsInputSchema>;

export function createListS3BucketsToolManifest(
  ctx: GatewayContext,
): ToolManifest<ListS3BucketsInput> {
  return {
    name: "list_s3_buckets",
    title: PUBLIC_TOOL_TITLES.list_s3_buckets,
    description: "Lists S3 buckets in the account with optional result limiting.",
    pack: "inventory",
    lifecycle: "stable",
    inputSchema: listS3BucketsInputSchema,
    outputSchema: listS3BucketsOutputSchema,
    visibility: { mcp: true, chatgpt: true },
    catalog: {
      keywords: ["s3", "buckets", "storage", "inventory"],
      docsAnchor: "8-list_s3_buckets",
      inputSummary: "Optional limit.",
      awsService: "s3",
    },
    auth: { requiredScopes: [...DEFAULT_AUTH_SCOPES] },
    aws: {
      services: ["s3"],
      actions: ["s3:ListAllMyBuckets"],
      capabilities: ["s3:ListAllMyBuckets"],
      regionMode: "global",
      readonly: true,
    },
    safety: {
      riskLevel: "read-only",
      cacheTtlSeconds: S3_CACHE_TTL_SECONDS,
      timeoutMs: 15000,
      costClass: "cached-read",
    },
    costControl: {
      class: "low",
      requiresCache: true,
      timeoutMs: 15000,
      maxResultCount: S3_MAX_BUCKETS,
      minCacheTtlSeconds: S3_CACHE_TTL_SECONDS,
    },
    audit: {
      awsService: "s3",
      sanitizeInput: (args) => summarizeS3BucketsInput(args),
    },
    descriptorKind: "aws-readonly",
    handler: async (args: ListS3BucketsInput) => {
      const buckets = await listBuckets(
        { limit: args.limit },
        ctx.credentials,
        ctx.cache,
      );

      const count = buckets.length;
      const bucketEntries = buckets.map((b) => ({
        name: b.name,
        createdAt: b.createdAt,
      }));

      const text = `Found ${count} S3 bucket(s).`;

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          count,
          buckets: bucketEntries,
        },
      };
    },
  };
}
