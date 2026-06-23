import type { AwsCapabilityId } from "../../aws/capabilities.js";
import type { AnyToolManifest, CostControlClass } from "../tools/manifest.js";
import type {
  CacheStatus,
  ExecutionCostClass,
  PricingModel,
  ToolExecutionBilling,
  ToolExecutionCache,
} from "./metadata.js";

export const AWS_CAPABILITY_UNIT_COST_USD: Readonly<
  Partial<Record<AwsCapabilityId, number>>
> = {
  "ce:GetCostAndUsage": 0.01,
};

const COST_CLASS_TO_PRICING_MODEL: Record<CostControlClass, PricingModel> = {
  free: "none",
  low: "none",
  paid: "per-request",
  "fanout-sensitive": "usage-dependent",
  "volume-sensitive": "usage-dependent",
};

const BILLING_NOTES: Record<CostControlClass, string> = {
  free: "No AWS API charges are expected for this tool.",
  low: "AWS API usage for this tool is typically low cost; no fixed per-request estimate is published.",
  paid: "Estimated AWS Cost Explorer API charge for a non-cached request. Final billing is determined by AWS.",
  "fanout-sensitive":
    "AWS API cost depends on region fanout and result size. Final billing is determined by AWS.",
  "volume-sensitive":
    "AWS API cost depends on scanned log volume and result size. Final billing is determined by AWS.",
};

export function resolvePricingModel(costClass: CostControlClass): PricingModel {
  return COST_CLASS_TO_PRICING_MODEL[costClass];
}

export function resolveBillingNote(costClass: CostControlClass): string {
  return BILLING_NOTES[costClass];
}

export function getCapabilityUnitCostUsd(
  capabilityId: AwsCapabilityId,
): number | undefined {
  return AWS_CAPABILITY_UNIT_COST_USD[capabilityId];
}

export function resolveDefaultCacheBlock(
  manifest: AnyToolManifest,
  cacheStatus?: CacheStatus,
): ToolExecutionCache {
  const enabled =
    manifest.costControl.requiresCache || manifest.safety.costClass === "cached-read";

  const status =
    cacheStatus ?? (enabled ? "unavailable" : "disabled");

  const cache: ToolExecutionCache = {
    enabled,
    status,
  };

  if (enabled) {
    cache.ttlSeconds = manifest.safety.cacheTtlSeconds;
  }

  return cache;
}

export function resolveBillingFromManifest(
  manifest: AnyToolManifest,
  options?: {
    charged?: boolean;
    estimatedCostUsd?: number;
  },
): ToolExecutionBilling {
  const costClass = manifest.costControl.class as ExecutionCostClass;

  return {
    provider: "aws",
    costClass,
    estimatedCostUsd: options?.estimatedCostUsd ?? 0,
    currency: "USD",
    charged: options?.charged ?? false,
    pricingModel: resolvePricingModel(manifest.costControl.class),
    note: resolveBillingNote(manifest.costControl.class),
  };
}

export function estimateCostUsdFromRequests(
  requests: ReadonlyArray<{
    requestCount: number;
    estimatedUnitCostUsd?: number;
  }>,
): number {
  return requests.reduce((total, request) => {
    if (request.requestCount <= 0 || request.estimatedUnitCostUsd === undefined) {
      return total;
    }
    return total + request.requestCount * request.estimatedUnitCostUsd;
  }, 0);
}

export function shouldChargeForCacheStatus(cacheStatus: CacheStatus): boolean {
  return cacheStatus === "miss" || cacheStatus === "bypass";
}
