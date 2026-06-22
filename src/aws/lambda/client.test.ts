import { describe, it, expect, vi, beforeEach } from "vitest";
import { listFunctions } from "./client.js";
import { buildCacheKey } from "../../cache/keys.js";
import {
  lambdaListFunctionsResponse,
  makeLambdaFunction,
} from "../../test/fixtures.js";
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

const allowedRegions = ["us-east-1", "us-west-2"];

beforeEach(() => {
  mockFetch.mockReset();
});

describe("listFunctions", () => {
  it("returns normalized functions from a single region", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        lambdaListFunctionsResponse([
          makeLambdaFunction({ functionName: "fn-a" }),
        ]),
      ),
    );

    const result = await listFunctions({}, ["us-east-1"], credentials);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      functionName: "fn-a",
      region: "us-east-1",
      runtime: "python3.12",
      state: "Active",
    });
  });

  it("queries multiple regions and merges results", async () => {
    mockFetch.mockImplementation((_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? "{}");
      if (body.MaxItems) {
        return Promise.resolve(
          lambdaListFunctionsResponse([
            makeLambdaFunction({ functionName: "fn-east" }),
          ]),
        );
      }
      return Promise.resolve(lambdaListFunctionsResponse([]));
    });

    const result = await listFunctions(
      { regions: ["us-east-1", "us-west-2"] },
      allowedRegions,
      credentials,
    );

    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("tolerates partial region failures", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          lambdaListFunctionsResponse([
            makeLambdaFunction({ functionName: "fn-ok" }),
          ]),
        );
      }
      return Promise.resolve(new Response("error", { status: 500 }));
    });

    const result = await listFunctions(
      { regions: ["us-east-1", "us-west-2"] },
      allowedRegions,
      credentials,
    );

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe("fn-ok");
  });

  it("applies global limit after merge", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        lambdaListFunctionsResponse([
          makeLambdaFunction({ functionName: "fn-1" }),
          makeLambdaFunction({ functionName: "fn-2" }),
          makeLambdaFunction({ functionName: "fn-3" }),
        ]),
      ),
    );

    const result = await listFunctions(
      { limit: 2, regions: ["us-east-1"] },
      ["us-east-1"],
      credentials,
    );

    expect(result).toHaveLength(2);
  });

  it("does not leak raw AWS fields", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        lambdaListFunctionsResponse([makeLambdaFunction()]),
      ),
    );

    const result = await listFunctions({}, ["us-east-1"], credentials);
    const keys = Object.keys(result[0]);
    expect(keys).not.toContain("MemorySize");
    expect(keys).not.toContain("LastModified");
  });

  it("sends correct X-Amz-Target header", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(lambdaListFunctionsResponse([])),
    );

    await listFunctions({}, ["us-east-1"], credentials);

    const headers = (mockFetch.mock.calls[0][1] as { headers?: Record<string, string> }).headers ?? {};
    expect(headers["X-Amz-Target"]).toBe("Lambda_20150331.ListFunctions");
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

describe("listFunctions with cache", () => {
  it("returns cached result without calling AWS on cache hit", async () => {
    const cache = createMockKv();
    const cached = [
      { functionName: "cached-fn", region: "us-east-1", runtime: "nodejs20.x", state: "Active" },
    ];
    const key = await buildCacheKey("list_lambda_functions", {
      regions: ["us-east-1"],
      limit: 100,
    });
    cache.store.set(key, JSON.stringify(cached));

    const result = await listFunctions({}, ["us-east-1"], credentials, cache as never);

    expect(result).toEqual(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls AWS and stores result on cache miss", async () => {
    const cache = createMockKv();
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        lambdaListFunctionsResponse([makeLambdaFunction()]),
      ),
    );

    await listFunctions({}, ["us-east-1"], credentials, cache as never);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });
});
