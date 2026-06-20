import type { KVNamespace } from "@cloudflare/workers-types";

const DEFAULT_TTL_SECONDS = 1800;

export async function cacheGet<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  try {
    const value = await kv.get(key, "json");
    return value as T | null;
  } catch {
    console.warn("cacheGet: KV read failed, falling through to AWS", key);
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
    console.warn("cacheSet: KV write failed, continuing with AWS result", key);
  }
}
