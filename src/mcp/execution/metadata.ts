import { z } from "zod";

export const CACHE_STATUSES = [
  "hit",
  "miss",
  "disabled",
  "unavailable",
  "bypass",
] as const;

export const EXECUTION_COST_CLASSES = [
  "free",
  "low",
  "paid",
  "fanout-sensitive",
  "volume-sensitive",
] as const;

export const PRICING_MODELS = [
  "none",
  "per-request",
  "per-1000-requests",
  "usage-dependent",
] as const;

export type CacheStatus = (typeof CACHE_STATUSES)[number];
export type ExecutionCostClass = (typeof EXECUTION_COST_CLASSES)[number];
export type PricingModel = (typeof PRICING_MODELS)[number];

export const toolExecutionCacheSchema = z.object({
  enabled: z.boolean(),
  status: z.enum(CACHE_STATUSES),
  ttlSeconds: z.number().int().nonnegative().optional(),
});

export const toolExecutionBillingSchema = z.object({
  provider: z.literal("aws"),
  costClass: z.enum(EXECUTION_COST_CLASSES),
  estimatedCostUsd: z.number().nonnegative(),
  currency: z.literal("USD"),
  charged: z.boolean(),
  pricingModel: z.enum(PRICING_MODELS),
  note: z.string().min(1),
});

export const awsRequestSummarySchema = z.object({
  service: z.string().min(1),
  action: z.string().min(1),
  region: z.string().min(1).optional(),
  requestCount: z.number().int().nonnegative(),
  estimatedUnitCostUsd: z.number().nonnegative().optional(),
});

export const toolExecutionMetadataSchema = z.object({
  cache: toolExecutionCacheSchema,
  billing: toolExecutionBillingSchema,
  awsRequests: z.array(awsRequestSummarySchema),
  awsRequestCount: z.number().int().nonnegative(),
});

export type ToolExecutionCache = z.infer<typeof toolExecutionCacheSchema>;
export type ToolExecutionBilling = z.infer<typeof toolExecutionBillingSchema>;
export type AwsRequestSummary = z.infer<typeof awsRequestSummarySchema>;
export type ToolExecutionMetadata = z.infer<typeof toolExecutionMetadataSchema>;

export function parseToolExecutionMetadata(value: unknown): ToolExecutionMetadata {
  return toolExecutionMetadataSchema.parse(value);
}
