import { getAwsCapability } from "../../aws/capabilities.js";
import { GatewayError } from "../../errors/public-error.js";
import type { AnyToolManifest } from "../tools/manifest.js";
import { isAwsBackedManifest } from "../tools/policy.js";
import type { AwsRequestSummary, CacheStatus, ToolExecutionMetadata } from "./metadata.js";
import { parseToolExecutionMetadata } from "./metadata.js";
import {
  estimateCostUsdFromRequests,
  getCapabilityUnitCostUsd,
  resolveBillingFromManifest,
  resolveDefaultCacheBlock,
  shouldChargeForCacheStatus,
} from "./pricing.js";

export type ExecutionRuntimeFacts = {
  cacheStatus?: CacheStatus;
  awsRequests?: AwsRequestSummary[];
};

function buildAwsRequestsFromManifest(manifest: AnyToolManifest): AwsRequestSummary[] {
  return manifest.aws.capabilities.map((capabilityId) => {
    const capability = getAwsCapability(capabilityId);
    const unitCost = getCapabilityUnitCostUsd(capabilityId);

    const summary: AwsRequestSummary = {
      service: capability.iamService,
      action: capability.iamAction,
      requestCount: 0,
    };

    if (unitCost !== undefined) {
      summary.estimatedUnitCostUsd = unitCost;
    }

    return summary;
  });
}

function sumRequestCounts(requests: ReadonlyArray<{ requestCount: number }>): number {
  return requests.reduce((total, request) => total + request.requestCount, 0);
}

export function buildAwsExecutionMetadataFromManifest(
  manifest: AnyToolManifest,
  facts?: ExecutionRuntimeFacts,
): ToolExecutionMetadata {
  if (!isAwsBackedManifest(manifest)) {
    throw new GatewayError(
      "validation_error",
      "Execution metadata is not applicable to non-AWS tools.",
    );
  }

  const cacheStatus = facts?.cacheStatus;
  const awsRequests = facts?.awsRequests ?? buildAwsRequestsFromManifest(manifest);
  const awsRequestCount = sumRequestCounts(awsRequests);
  const estimatedCostUsd = estimateCostUsdFromRequests(awsRequests);
  const charged =
    cacheStatus !== undefined &&
    shouldChargeForCacheStatus(cacheStatus) &&
    estimatedCostUsd > 0;

  const metadata: ToolExecutionMetadata = {
    cache: resolveDefaultCacheBlock(manifest, cacheStatus),
    billing: resolveBillingFromManifest(manifest, {
      charged,
      estimatedCostUsd: charged ? estimatedCostUsd : 0,
    }),
    awsRequests,
    awsRequestCount,
  };

  return parseToolExecutionMetadata(metadata);
}
