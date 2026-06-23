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
    "No fixed per-request AWS API charge is estimated for this tool. High-volume usage may still contribute to provider or platform costs.",
  "volume-sensitive":
    "No fixed per-request AWS API charge is estimated for this tool. High-volume usage may still contribute to provider or platform costs.",
};

const PAID_CACHE_HIT_NOTE =
  "No new AWS Cost Explorer API request was made. Final billing is determined by AWS.";

export function resolvePricingModel(costClass: CostControlClass): PricingModel {
  return COST_CLASS_TO_PRICING_MODEL[costClass];
}

export function resolveBillingNote(
  costClass: CostControlClass,
  options?: {
    cacheStatus?: CacheStatus;
    charged?: boolean;
  },
): string {
  if (costClass === "paid") {
    if (
      options?.cacheStatus === "hit" ||
      (options?.charged === false && options?.cacheStatus !== undefined)
    ) {
      return PAID_CACHE_HIT_NOTE;
    }
    return BILLING_NOTES.paid;
  }

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
    cacheStatus?: CacheStatus;
  },
): ToolExecutionBilling {
  const costClass = manifest.costControl.class as ExecutionCostClass;
  const charged = options?.charged ?? false;

  return {
    provider: "aws",
    costClass,
    estimatedCostUsd: options?.estimatedCostUsd ?? 0,
    currency: "USD",
    charged,
    pricingModel: resolvePricingModel(manifest.costControl.class),
    note: resolveBillingNote(manifest.costControl.class, {
      cacheStatus: options?.cacheStatus,
      charged,
    }),
  };
}

export function paidManifestHasModeledUnitCosts(manifest: AnyToolManifest): boolean {
  if (manifest.costControl.class !== "paid") {
    return true;
  }

  return manifest.aws.capabilities.every(
    (capabilityId) => getCapabilityUnitCostUsd(capabilityId) !== undefined,
  );
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
