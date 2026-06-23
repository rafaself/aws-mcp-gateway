import { getAwsCapability } from "../../aws/capabilities.js";
import type { AnyToolManifest } from "../tools/manifest.js";
import type { ExecutionRuntimeFacts } from "./build.js";
import type { AwsRequestSummary } from "./metadata.js";
import { getCapabilityUnitCostUsd } from "./pricing.js";
import type { ExecutionCollectorSnapshot } from "../../telemetry/collector.js";

function buildEmptyAwsRequestsFromManifest(manifest: AnyToolManifest): AwsRequestSummary[] {
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

export function buildRuntimeFactsFromSnapshot(
  manifest: AnyToolManifest,
  snapshot: ExecutionCollectorSnapshot,
): ExecutionRuntimeFacts {
  const awsRequests = buildEmptyAwsRequestsFromManifest(manifest);

  for (const recorded of snapshot.awsRequests) {
    const capability = getAwsCapability(recorded.capabilityId);

    const existing = awsRequests.find(
      (request) =>
        request.service === capability.iamService && request.action === capability.iamAction,
    );

    if (existing) {
      existing.requestCount += recorded.requestCount;
      if (recorded.region !== undefined && existing.region === undefined) {
        existing.region = recorded.region;
      }
      continue;
    }

    const unitCost = getCapabilityUnitCostUsd(recorded.capabilityId);
    const summary: AwsRequestSummary = {
      service: capability.iamService,
      action: capability.iamAction,
      requestCount: recorded.requestCount,
    };

    if (recorded.region !== undefined) {
      summary.region = recorded.region;
    }
    if (unitCost !== undefined) {
      summary.estimatedUnitCostUsd = unitCost;
    }

    awsRequests.push(summary);
  }

  for (const request of awsRequests) {
    if (request.requestCount > 0) {
      continue;
    }

    let totalForCapability = 0;
    for (const recorded of snapshot.awsRequests) {
      const capability = getAwsCapability(recorded.capabilityId);
      if (capability.iamService === request.service && capability.iamAction === request.action) {
        totalForCapability += recorded.requestCount;
      }
    }

    if (totalForCapability > 0) {
      request.requestCount = totalForCapability;
    }
  }

  let cacheStatus: ExecutionRuntimeFacts["cacheStatus"];
  if (snapshot.cacheStatuses.length > 0) {
    const priority: ExecutionRuntimeFacts["cacheStatus"][] = [
      "miss",
      "bypass",
      "unavailable",
      "hit",
      "disabled",
    ];
    cacheStatus = priority.find((status) => snapshot.cacheStatuses.includes(status!));
  }

  return {
    cacheStatus,
    awsRequests,
  };
}
