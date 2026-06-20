import type { KVNamespace } from "@cloudflare/workers-types";

const DEFAULT_TTL_SECONDS = 1800;

export async function cacheGet<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const value = await kv.get(key, "json");
  return value as T | null;
}

export async function cacheSet<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}
