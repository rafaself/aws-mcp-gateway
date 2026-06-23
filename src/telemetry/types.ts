import type { AwsCapabilityId } from "../aws/capabilities.js";

export const CACHE_STATUSES = [
  "hit",
  "miss",
  "disabled",
  "unavailable",
  "bypass",
] as const;

export type CacheStatus = (typeof CACHE_STATUSES)[number];

export interface ExecutionTelemetry {
  recordCacheStatus(status: CacheStatus): void;
  recordAwsRequest(capabilityId: AwsCapabilityId, region?: string): void;
}
