import { describe, it, expect } from "vitest";
import { buildCacheKey, serializeValue } from "./keys.js";

describe("serializeValue", () => {
  describe("primitives", () => {
    it("serializes strings", () => {
      expect(serializeValue("hello")).toBe('{"t":"string","v":"hello"}');
    });

    it("serializes empty string", () => {
      expect(serializeValue("")).toBe('{"t":"string","v":""}');
    });

    it("serializes numbers", () => {
      expect(serializeValue(42)).toBe('{"t":"number","v":42}');
      expect(serializeValue(0)).toBe('{"t":"number","v":0}');
      expect(serializeValue(-1)).toBe('{"t":"number","v":-1}');
    });

    it("serializes booleans", () => {
      expect(serializeValue(true)).toBe('{"t":"boolean","v":true}');
      expect(serializeValue(false)).toBe('{"t":"boolean","v":false}');
    });

    it("serializes null", () => {
      expect(serializeValue(null)).toBe('{"t":"null"}');
    });

    it("serializes undefined", () => {
      expect(serializeValue(undefined)).toBe('{"t":"undefined"}');
    });
  });

  describe("arrays", () => {
    it("serializes empty array", () => {
      expect(serializeValue([])).toBe('{"t":"array","v":[]}');
    });

    it("serializes array of strings", () => {
      expect(serializeValue(["a", "b"])).toBe(
        '{"t":"array","v":[{"t":"string","v":"a"},{"t":"string","v":"b"}]}',
      );
    });

    it("serializes array of numbers", () => {
      expect(serializeValue([1, 2])).toBe(
        '{"t":"array","v":[{"t":"number","v":1},{"t":"number","v":2}]}',
      );
    });

    it("serializes array with single element", () => {
      expect(serializeValue(["only"])).toBe(
        '{"t":"array","v":[{"t":"string","v":"only"}]}',
      );
    });

    it("preserves array order", () => {
      const a = serializeValue(["b", "a"]);
      const b = serializeValue(["a", "b"]);
      expect(a).not.toBe(b);
    });

    it("serializes nested arrays", () => {
      expect(serializeValue([["x"], ["y"]])).toBe(
        '{"t":"array","v":[{"t":"array","v":[{"t":"string","v":"x"}]},{"t":"array","v":[{"t":"string","v":"y"}]}]}',
      );
    });
  });

  describe("objects", () => {
    it("serializes empty object", () => {
      expect(serializeValue({})).toBe('{"t":"object","v":[]}');
    });

    it("serializes flat object with primitives", () => {
      expect(serializeValue({ a: 1, b: "x" })).toBe(
        '{"t":"object","v":[["a",{"t":"number","v":1}],["b",{"t":"string","v":"x"}]]}',
      );
    });

    it("sorts object keys recursively", () => {
      const result = serializeValue({ z: 1, a: 2, m: 3 });
      expect(result).toBe(
        '{"t":"object","v":[["a",{"t":"number","v":2}],["m",{"t":"number","v":3}],["z",{"t":"number","v":1}]]}',
      );
    });

    it("serializes nested objects", () => {
      const value = { outer: { inner: 42 } };
      expect(serializeValue(value)).toBe(
        '{"t":"object","v":[["outer",{"t":"object","v":[["inner",{"t":"number","v":42}]]}]]}',
      );
    });

    it("sorts nested object keys", () => {
      const value = { b: { z: 1, a: 2 }, a: 1 };
      expect(serializeValue(value)).toBe(
        '{"t":"object","v":[["a",{"t":"number","v":1}],["b",{"t":"object","v":[["a",{"t":"number","v":2}],["z",{"t":"number","v":1}]]}]]}',
      );
    });
  });

  describe("null vs undefined vs omitted", () => {
    it("distinguishes null from undefined", () => {
      expect(serializeValue(null)).not.toBe(serializeValue(undefined));
    });

    it("distinguishes empty array from empty string", () => {
      expect(serializeValue([])).not.toBe(serializeValue(""));
    });
  });

  describe("distinct types", () => {
    it("distinguishes different primitive types", () => {
      const results = new Set([
        serializeValue("42"),
        serializeValue(42),
        serializeValue(true),
        serializeValue(null),
        serializeValue(undefined),
      ]);
      expect(results.size).toBe(5);
    });

    it("distinguishes between array and object with same content", () => {
      expect(serializeValue(["a"])).not.toBe(serializeValue({ 0: "a" }));
    });
  });

  describe("collision safety", () => {
    it("does not collide when string value contains & delimiter", () => {
      const a = serializeValue({ a: "x&b=s:y" });
      const b = serializeValue({ a: "x", b: "y" });
      expect(a).not.toBe(b);
    });

    it("does not collide when string value contains comma delimiter", () => {
      const a = serializeValue(["a,s:b"]);
      const b = serializeValue(["a", "b"]);
      expect(a).not.toBe(b);
    });

    it("does not collide when object key contains = delimiter", () => {
      const a = serializeValue({ "a=b": "x" });
      const b = serializeValue({ a: "b=s:x" });
      expect(a).not.toBe(b);
    });
  });
});

describe("buildCacheKey", () => {
  it("returns deterministic keys for identical inputs", async () => {
    const params = {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
      metric: "UnblendedCost",
    };

    const key1 = await buildCacheKey("get_aws_cost_summary", params);
    const key2 = await buildCacheKey("get_aws_cost_summary", params);

    expect(key1).toBe(key2);
  });

  it("returns different keys for different tool names", async () => {
    const params = {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    };

    const key1 = await buildCacheKey("get_aws_cost_summary", params);
    const key2 = await buildCacheKey("get_aws_cost_by_service", params);

    expect(key1).not.toBe(key2);
  });

  it("returns different keys for different date ranges", async () => {
    const key1 = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    const key2 = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-02-01",
      endDate: "2025-03-01",
      granularity: "MONTHLY",
    });

    expect(key1).not.toBe(key2);
  });

  it("returns deterministic result regardless of param ordering", async () => {
    const key1 = await buildCacheKey("test_tool", {
      a: "1",
      b: "2",
      c: "3",
    });

    const key2 = await buildCacheKey("test_tool", {
      c: "3",
      a: "1",
      b: "2",
    });

    expect(key1).toBe(key2);
  });

  it("produces a key prefixed with ce:", async () => {
    const key = await buildCacheKey("get_aws_cost_summary", {
      startDate: "2025-01-01",
      endDate: "2025-02-01",
    });

    expect(key).toMatch(/^ce:[a-f0-9]{64}$/);
  });

  it("distinguishes null from undefined params", async () => {
    const key1 = await buildCacheKey("tool", { value: null });
    const key2 = await buildCacheKey("tool", { value: undefined });
    expect(key1).not.toBe(key2);
  });

  it("distinguishes omitted from explicitly undefined", async () => {
    const key1 = await buildCacheKey("tool", { a: 1 });
    const key2 = await buildCacheKey("tool", { a: 1, extra: undefined });
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for arrays vs objects with same entries", async () => {
    const key1 = await buildCacheKey("tool", { items: ["a"] });
    const key2 = await buildCacheKey("tool", { items: { "0": "a" } });
    expect(key1).not.toBe(key2);
  });

  it("handles arrays in params", async () => {
    const key = await buildCacheKey("list_ec2_instances", {
      regions: ["us-east-1", "us-west-2"],
      stateFilter: [],
    });

    expect(key).toMatch(/^ce:[a-f0-9]{64}$/);
  });

  it("handles nested objects in params", async () => {
    const key = await buildCacheKey("tool", {
      filter: { field: "status", values: ["active", "pending"] },
    });

    expect(key).toMatch(/^ce:[a-f0-9]{64}$/);
  });

  it("produces the same key for reverse-ordered object keys", async () => {
    const key1 = await buildCacheKey("tool", { a: { z: 1, y: 2 }, b: 3 });
    const key2 = await buildCacheKey("tool", { b: 3, a: { y: 2, z: 1 } });
    expect(key1).toBe(key2);
  });
});
