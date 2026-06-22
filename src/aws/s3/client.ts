import { buildCacheKey } from "../../cache/keys.js";
import { cacheGet, cacheSet } from "../../cache/kv.js";
import { S3_CACHE_TTL_SECONDS, S3_MAX_BUCKETS } from "../../security/limits.js";
import type { AwsCredentials } from "../types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { s3ListBucketsFetch } from "./fetch.js";
import { parseListBucketsXml } from "./parse.js";
import type { S3Bucket, S3ListBucketsOptions } from "./types.js";

export async function listBuckets(
  options: S3ListBucketsOptions,
  credentials: AwsCredentials,
  cache?: KVNamespace,
): Promise<S3Bucket[]> {
  const limit = options.limit ?? S3_MAX_BUCKETS;

  if (cache) {
    const cacheKey = await buildCacheKey("list_s3_buckets", { limit });
    const cached = await cacheGet<S3Bucket[]>(cache, cacheKey);
    if (cached) return cached;
  }

  const xml = await s3ListBucketsFetch(credentials);
  const buckets = parseListBucketsXml(xml);

  buckets.sort((a, b) => a.name.localeCompare(b.name));
  const result = buckets.slice(0, limit);

  if (cache) {
    const cacheKey = await buildCacheKey("list_s3_buckets", { limit });
    await cacheSet(cache, cacheKey, result, S3_CACHE_TTL_SECONDS);
  }

  return result;
}
