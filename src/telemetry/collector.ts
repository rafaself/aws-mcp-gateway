import type { AwsCapabilityId } from "../aws/capabilities.js";
import { getAwsCapability } from "../aws/capabilities.js";
import type { CacheStatus, ExecutionTelemetry } from "./types.js";

const CACHE_STATUS_PRIORITY: readonly CacheStatus[] = [
  "miss",
  "bypass",
  "unavailable",
  "hit",
  "disabled",
];

function awsRequestKey(capabilityId: AwsCapabilityId, region?: string): string {
  return region ? `${capabilityId}|${region}` : capabilityId;
}

function parseAwsRequestKey(key: string): { capabilityId: AwsCapabilityId; region?: string } {
  const separatorIndex = key.indexOf("|");
  if (separatorIndex === -1) {
    return { capabilityId: key as AwsCapabilityId };
  }

  return {
    capabilityId: key.slice(0, separatorIndex) as AwsCapabilityId,
    region: key.slice(separatorIndex + 1),
  };
}

export type RecordedAwsRequest = {
  capabilityId: AwsCapabilityId;
  region?: string;
  requestCount: number;
};

export type ExecutionCollectorSnapshot = {
  cacheStatuses: readonly CacheStatus[];
  awsRequests: readonly RecordedAwsRequest[];
};

export type ExecutionCollector = ExecutionTelemetry & {
  reset(): void;
  resolveCacheStatus(): CacheStatus | undefined;
  snapshot(): ExecutionCollectorSnapshot;
};

export function createExecutionCollector(): ExecutionCollector {
  let cacheStatuses: CacheStatus[] = [];
  const awsRequestCounts = new Map<string, number>();

  function reset(): void {
    cacheStatuses = [];
    awsRequestCounts.clear();
  }

  function recordCacheStatus(status: CacheStatus): void {
    cacheStatuses.push(status);
  }

  function recordAwsRequest(capabilityId: AwsCapabilityId, region?: string): void {
    const key = awsRequestKey(capabilityId, region);
    awsRequestCounts.set(key, (awsRequestCounts.get(key) ?? 0) + 1);
  }

  function resolveCacheStatus(): CacheStatus | undefined {
    if (cacheStatuses.length === 0) {
      return undefined;
    }

    for (const status of CACHE_STATUS_PRIORITY) {
      if (cacheStatuses.includes(status)) {
        return status;
      }
    }

    return cacheStatuses[0];
  }

  function snapshot(): ExecutionCollectorSnapshot {
    const awsRequests: RecordedAwsRequest[] = [];

    for (const [key, requestCount] of awsRequestCounts) {
      const { capabilityId, region } = parseAwsRequestKey(key);
      getAwsCapability(capabilityId);
      awsRequests.push({ capabilityId, region, requestCount });
    }

    return {
      cacheStatuses: [...cacheStatuses],
      awsRequests,
    };
  }

  return {
    reset,
    recordCacheStatus,
    recordAwsRequest,
    resolveCacheStatus,
    snapshot,
  };
}
