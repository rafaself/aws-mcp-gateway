import type { KVNamespace } from "@cloudflare/workers-types";
import type { ExecutionTelemetry } from "../telemetry/types.js";
import type { CacheStatus } from "../telemetry/types.js";
import { logWarn } from "../observability/logging.js";

export type CacheReadResult<T> = {
  value: T | null;
  status: CacheStatus;
};

export async function cacheReadWithStatus<T>(
  kv: KVNamespace | undefined,
  key: string,
  execution?: ExecutionTelemetry,
): Promise<CacheReadResult<T>> {
  if (!kv) {
    execution?.recordCacheStatus("disabled");
    return { value: null, status: "disabled" };
  }

  let value: T | null;
  try {
    value = (await kv.get(key, "json")) as T | null;
  } catch {
    logWarn({ phase: "cache_kv_read_failed", operation: "get" });
    execution?.recordCacheStatus("unavailable");
    return { value: null, status: "unavailable" };
  }

  if (value === null) {
    execution?.recordCacheStatus("miss");
    return { value: null, status: "miss" };
  }

  execution?.recordCacheStatus("hit");
  return { value, status: "hit" };
}
