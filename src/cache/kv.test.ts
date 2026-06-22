import { describe, it, expect, vi } from "vitest";
import { cacheGet, cacheSet } from "./kv.js";

function createMockKv(): {
  store: Map<string, { value: string; expiresAt: number }>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, { value: string; expiresAt: number }>();

  const get = vi.fn(async (key: string, type?: string) => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    if (type === "json") {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    return entry.value;
  });

  const put = vi.fn(
    async (
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ) => {
      const expiresAt = options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : Infinity;
      store.set(key, { value, expiresAt });
    },
  );

  return { store, get, put };
}

describe("cacheGet", () => {
  it("returns null for a missing key", async () => {
    const kv = createMockKv();
    const result = await cacheGet(kv as never, "nonexistent");
    expect(result).toBeNull();
  });

  it("returns parsed JSON value for an existing key", async () => {
    const kv = createMockKv();
    kv.store.set("my-key", {
      value: JSON.stringify({ total: 42.5, currency: "USD" }),
      expiresAt: Infinity,
    });

    const result = await cacheGet<{ total: number; currency: string }>(
      kv as never,
      "my-key",
    );

    expect(result).toEqual({ total: 42.5, currency: "USD" });
  });

  it("returns null for an expired key", async () => {
    const kv = createMockKv();
    kv.store.set("my-key", {
      value: JSON.stringify({ total: 100 }),
      expiresAt: Date.now() - 1000,
    });

    const result = await cacheGet(kv as never, "my-key");
    expect(result).toBeNull();
  });

  it("delegates to kv.get with json type", async () => {
    const kv = createMockKv();
    kv.store.set("ce:abc123", {
      value: JSON.stringify("cached"),
      expiresAt: Infinity,
    });

    await cacheGet(kv as never, "ce:abc123");

    expect(kv.get).toHaveBeenCalledWith("ce:abc123", "json");
  });

  it("returns null when kv.get throws", async () => {
    const kv = createMockKv();
    kv.get.mockRejectedValue(new Error("KV unavailable"));

    const result = await cacheGet(kv as never, "some-key");

    expect(result).toBeNull();
  });
});

describe("cacheSet", () => {
  it("stores a value as JSON string", async () => {
    const kv = createMockKv();
    const value = { total: 42.5, currency: "USD" };

    await cacheSet(kv as never, "my-key", value);

    expect(kv.put).toHaveBeenCalledWith(
      "my-key",
      JSON.stringify(value),
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
  });

  it("stores a value retrievable by cacheGet", async () => {
    const kv = createMockKv();
    const value = { period: { startDate: "2025-01-01", endDate: "2025-02-01" }, total: 100, currency: "USD" };

    await cacheSet(kv as never, "test-key", value);
    const retrieved = await cacheGet<typeof value>(kv as never, "test-key");

    expect(retrieved).toEqual(value);
  });

  it("defaults TTL to 1800 seconds", async () => {
    const kv = createMockKv();

    await cacheSet(kv as never, "key", { data: 1 });

    expect(kv.put).toHaveBeenCalledWith(
      "key",
      expect.any(String),
      { expirationTtl: 1800 },
    );
  });

  it("accepts a custom TTL", async () => {
    const kv = createMockKv();

    await cacheSet(kv as never, "key", { data: 1 }, 300);

    expect(kv.put).toHaveBeenCalledWith(
      "key",
      expect.any(String),
      { expirationTtl: 300 },
    );
  });

  it("does not throw when kv.put throws", async () => {
    const kv = createMockKv();
    kv.put.mockRejectedValue(new Error("KV unavailable"));

    await expect(
      cacheSet(kv as never, "key", { data: 1 }),
    ).resolves.toBeUndefined();
  });
});
