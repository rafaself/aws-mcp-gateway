import type { KVNamespace } from "@cloudflare/workers-types";
import { logWarn } from "../observability/logging.js";

const DEFAULT_TTL_SECONDS = 1800;

export async function cacheGet<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  try {
    const value = await kv.get(key, "json");
    return value as T | null;
  } catch {
    logWarn({ phase: "cache_kv_read_failed", operation: "get" });
    return null;
  }
}

export async function cacheSet<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch {
    logWarn({ phase: "cache_kv_write_failed", operation: "set" });
  }
}
