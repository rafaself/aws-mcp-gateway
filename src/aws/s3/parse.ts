import type { S3Bucket } from "./types.js";

const BUCKET_BLOCK_RE =
  /<Bucket>\s*<Name>([^<]*)<\/Name>\s*<CreationDate>([^<]*)<\/CreationDate>\s*<\/Bucket>/g;

export function parseListBucketsXml(xml: string): S3Bucket[] {
  const buckets: S3Bucket[] = [];
  let match: RegExpExecArray | null;

  BUCKET_BLOCK_RE.lastIndex = 0;
  while ((match = BUCKET_BLOCK_RE.exec(xml)) !== null) {
    buckets.push({
      name: match[1],
      createdAt: match[2],
    });
  }

  return buckets;
}
