import { describe, it, expect, vi, beforeEach } from "vitest";
import { listBuckets } from "./client.js";
import { parseListBucketsXml } from "./parse.js";
import { buildCacheKey } from "../../cache/keys.js";
import { s3ListBucketsXml } from "../../test/fixtures.js";
import type { AwsCredentials } from "../types.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials: AwsCredentials = {
  accessKeyId: "AKIA-test-key",
  secretAccessKey: "test-secret",
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("parseListBucketsXml", () => {
  it("extracts bucket names and creation dates only", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult>
  <Buckets>
    <Bucket>
      <Name>my-bucket</Name>
      <CreationDate>2020-01-01T00:00:00.000Z</CreationDate>
    </Bucket>
  </Buckets>
</ListAllMyBucketsResult>`;

    expect(parseListBucketsXml(xml)).toEqual([
      { name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" },
    ]);
  });
});

describe("listBuckets", () => {
  it("returns normalized buckets sorted by name", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([
          { name: "z-bucket", createdAt: "2021-01-01T00:00:00.000Z" },
          { name: "a-bucket", createdAt: "2020-01-01T00:00:00.000Z" },
        ]),
      ),
    );

    const result = await listBuckets({}, credentials);

    expect(result).toEqual([
      { name: "a-bucket", createdAt: "2020-01-01T00:00:00.000Z" },
      { name: "z-bucket", createdAt: "2021-01-01T00:00:00.000Z" },
    ]);
  });

  it("applies limit", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([
          { name: "bucket-a", createdAt: "2020-01-01T00:00:00.000Z" },
          { name: "bucket-b", createdAt: "2021-01-01T00:00:00.000Z" },
          { name: "bucket-c", createdAt: "2022-01-01T00:00:00.000Z" },
        ]),
      ),
    );

    const result = await listBuckets({ limit: 2 }, credentials);
    expect(result).toHaveLength(2);
  });

  it("does not leak owner or raw XML fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }]),
      ),
    );

    const result = await listBuckets({}, credentials);
    expect(Object.keys(result[0])).toEqual(["name", "createdAt"]);
  });

  it("calls global S3 endpoint", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(s3ListBucketsXml([])),
    );

    await listBuckets({}, credentials);

    expect(mockFetch.mock.calls[0][0]).toBe("https://s3.amazonaws.com/");
  });
});

function createMockKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => {
      const raw = store.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    }),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("listBuckets with cache", () => {
  it("returns cached result without calling AWS on cache hit", async () => {
    const cache = createMockKv();
    const cached = [{ name: "cached-bucket", createdAt: "2020-01-01T00:00:00.000Z" }];
    const key = await buildCacheKey("list_s3_buckets", { limit: 100 });
    cache.store.set(key, JSON.stringify(cached));

    const result = await listBuckets({}, credentials, cache as never);

    expect(result).toEqual(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls AWS and stores result on cache miss", async () => {
    const cache = createMockKv();
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        s3ListBucketsXml([{ name: "my-bucket", createdAt: "2020-01-01T00:00:00.000Z" }]),
      ),
    );

    await listBuckets({}, credentials, cache as never);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });
});
