import { GatewayError } from "../../errors/public-error.js";
import { validateCostDates } from "../../security/dates.js";
import { ValidationError } from "../../security/errors.js";
import { resolveRegions } from "../../security/regions.js";
import type { AnyToolManifest } from "./manifest.js";

export type CostControlPolicyContext = {
  allowedRegions: readonly string[];
};

const CACHE_REQUIRED_CLASSES = new Set([
  "paid",
  "volume-sensitive",
  "fanout-sensitive",
]);

function policyDenial(message: string): GatewayError {
  return new GatewayError("validation_error", message);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateCostControlManifest(manifest: AnyToolManifest): GatewayError | null {
  const costControl = manifest.costControl;

  if (!costControl || typeof costControl !== "object") {
    return policyDenial("Tool is missing required cost-control metadata.");
  }

  if (!costControl.class || typeof costControl.class !== "string") {
    return policyDenial("Tool is missing required cost-control metadata.");
  }

  if (typeof costControl.requiresCache !== "boolean") {
    return policyDenial("Tool is missing required cost-control metadata.");
  }

  if (!isPositiveInteger(costControl.timeoutMs)) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (manifest.safety.timeoutMs !== costControl.timeoutMs) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (costControl.maxRegions !== undefined && !isPositiveInteger(costControl.maxRegions)) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (costControl.maxDateRangeDays !== undefined && !isPositiveInteger(costControl.maxDateRangeDays)) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (costControl.maxResultCount !== undefined && !isPositiveInteger(costControl.maxResultCount)) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (costControl.maxLookbackHours !== undefined && !isPositiveInteger(costControl.maxLookbackHours)) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (
    costControl.minCacheTtlSeconds !== undefined &&
    !isPositiveInteger(costControl.minCacheTtlSeconds)
  ) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (manifest.descriptorKind === "aws-readonly") {
    if (costControl.class === "free") {
      return policyDenial("Tool cost-control metadata is invalid.");
    }
  } else if (costControl.class !== "free" || costControl.requiresCache) {
    return policyDenial("Tool cost-control metadata is invalid.");
  }

  if (CACHE_REQUIRED_CLASSES.has(costControl.class)) {
    if (!costControl.requiresCache) {
      return policyDenial("Tool cost-control metadata is invalid.");
    }

    if (!isPositiveInteger(costControl.minCacheTtlSeconds)) {
      return policyDenial("Tool cost-control metadata is invalid.");
    }

    if (manifest.safety.cacheTtlSeconds < costControl.minCacheTtlSeconds) {
      return policyDenial("Tool cost-control metadata is invalid.");
    }
  }

  return null;
}

export function validateCostControlRequest(
  manifest: AnyToolManifest,
  policy: CostControlPolicyContext,
  args: Record<string, unknown>,
): GatewayError | null {
  const costControl = manifest.costControl;
  if (!costControl) {
    return policyDenial("Tool is missing required cost-control metadata.");
  }

  if (
    costControl.maxDateRangeDays !== undefined &&
    typeof args.startDate === "string" &&
    typeof args.endDate === "string"
  ) {
    try {
      validateCostDates(args.startDate, args.endDate, costControl.maxDateRangeDays);
    } catch (error) {
      if (error instanceof ValidationError) {
        return policyDenial("Date range is not allowed for this tool.");
      }
      throw error;
    }
  }

  if (costControl.maxResultCount !== undefined) {
    if (typeof args.limit === "number" && args.limit > costControl.maxResultCount) {
      return policyDenial("Result count is not allowed for this tool.");
    }
    if (typeof args.serviceLimit === "number" && args.serviceLimit > costControl.maxResultCount) {
      return policyDenial("Result count is not allowed for this tool.");
    }
  }

  if (costControl.maxLookbackHours !== undefined && typeof args.hours === "number") {
    if (args.hours > costControl.maxLookbackHours) {
      return policyDenial("Lookback window is not allowed for this tool.");
    }
  }

  if (manifest.aws.regionMode === "bounded-multi-region") {
    const requestedRegions = Array.isArray(args.regions)
      ? args.regions.filter((region): region is string => typeof region === "string")
      : undefined;

    try {
      const resolvedRegions = resolveRegions(requestedRegions, [...policy.allowedRegions]);
      const configuredMax = costControl.maxRegions ?? policy.allowedRegions.length;
      const effectiveMax = Math.min(configuredMax, policy.allowedRegions.length);

      if (resolvedRegions.length > effectiveMax) {
        return policyDenial("Region fanout is not allowed for this tool.");
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        return policyDenial(error.message);
      }
      throw error;
    }
  }

  return null;
}
