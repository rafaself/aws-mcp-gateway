import { describe, expect, it, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { ValidationError } from "../security/errors.js";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import {
  INVALID_PROFILE_INDEX_ERROR,
  listApplicationProfiles,
  loadApplicationProfile,
} from "./loader.js";

const validIndex = {
  version: 1,
  profiles: [
    {
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      enabled: true,
      aliases: ["example", "prod"],
      capabilities: ["ecs", "rds"],
    },
  ],
};

const validProfile = {
  version: 1,
  id: "example-prod",
  displayName: "Example Production",
  environment: "production",
  region: "us-east-1",
  resources: {
    ecs: {
      clusterName: "example-production",
      serviceName: "example-production-api",
    },
  },
};

const invalidIndexResult = {
  status: "invalid" as const,
  profiles: [],
  error: INVALID_PROFILE_INDEX_ERROR,
};

function createMockKv(store: Record<string, unknown>): KVNamespace {
  return {
    get: vi.fn(async (key: string, type?: "text" | "json") => {
      if (!(key in store)) {
        return null;
      }
      const value = store[key];
      if (type === "text") {
        return typeof value === "string" ? value : JSON.stringify(value);
      }
      return value;
    }),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function createFailingKv(): KVNamespace {
  return {
    get: vi.fn(async () => {
      throw new Error("kv unavailable");
    }),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function expectSafeInvalidResult(result: Awaited<ReturnType<typeof listApplicationProfiles>>) {
  expect(result).toEqual(invalidIndexResult);
  expect(JSON.stringify(result)).not.toContain("AKIA");
  expect(JSON.stringify(result)).not.toContain("password");
  expect(JSON.stringify(result)).not.toContain("secret");
}

describe("listApplicationProfiles", () => {
  it("returns disabled state when appConfig binding is missing", async () => {
    const ctx = createTestGatewayContext();
    const result = await listApplicationProfiles(ctx);
    expect(result).toEqual({ status: "disabled", profiles: [] });
  });

  it("returns empty list when index is missing", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({}),
    });
    const result = await listApplicationProfiles(ctx);
    expect(result).toEqual({ status: "available", profiles: [] });
  });

  it("returns empty list for empty index", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": { version: 1, profiles: [] },
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expect(result).toEqual({ status: "available", profiles: [] });
  });

  it("returns invalid state for invalid index schema", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": { version: 2, profiles: [] },
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expectSafeInvalidResult(result);
  });

  it("returns invalid state for malformed JSON index", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": "{not-valid-json",
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expectSafeInvalidResult(result);
  });

  it("returns invalid state for duplicate profile ids", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": {
          version: 1,
          profiles: [validIndex.profiles[0], validIndex.profiles[0]],
        },
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expectSafeInvalidResult(result);
  });

  it("returns invalid state for disallowed region in index", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": {
          version: 1,
          profiles: [{ ...validIndex.profiles[0], region: "eu-west-1" }],
        },
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expectSafeInvalidResult(result);
  });

  it("does not leak secret-like index content in invalid result", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": {
          version: 1,
          profiles: [
            {
              ...validIndex.profiles[0],
              displayName: "password=supersecret",
            },
          ],
        },
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expectSafeInvalidResult(result);
    expect(JSON.stringify(result)).not.toContain("supersecret");
  });

  it("returns unavailable state when KV read fails", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createFailingKv(),
    });
    const result = await listApplicationProfiles(ctx);
    expect(result).toEqual({ status: "unavailable", profiles: [] });
  });

  it("returns validated profiles from index", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expect(result.status).toBe("available");
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]?.id).toBe("example-prod");
  });

  it("uses custom index key from context", async () => {
    const ctx = createTestGatewayContext({
      appProfileIndexKey: "custom/index.json",
      appConfig: createMockKv({
        "custom/index.json": validIndex,
      }),
    });
    const result = await listApplicationProfiles(ctx);
    expect(result.profiles).toHaveLength(1);
  });
});

describe("loadApplicationProfile", () => {
  it("fails closed when appConfig binding is missing", async () => {
    const ctx = createTestGatewayContext();
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(ValidationError);
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(
      /not configured/i,
    );
  });

  it("fails closed when KV is unavailable", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createFailingKv(),
    });
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(
      /unavailable/i,
    );
  });

  it("fails closed when index is invalid", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": { version: 2, profiles: [] },
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(
      /index is invalid/i,
    );
  });

  it("returns validation error when profile is missing", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
      }),
    });
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(/not found/i);
  });

  it("returns validation error for invalid profile JSON schema", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-prod.json": {
          version: 2,
          id: "example-prod",
          resources: { ecs: { clusterName: "x", serviceName: "y" } },
        },
      }),
    });
    await expect(loadApplicationProfile(ctx, "example-prod")).rejects.toThrow(ValidationError);
  });

  it("loads a valid profile successfully", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    const profile = await loadApplicationProfile(ctx, "example-prod");
    expect(profile.id).toBe("example-prod");
    expect(profile.resources.ecs?.serviceName).toBe("example-production-api");
  });

  it("rejects invalid profileId before KV access", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    await expect(loadApplicationProfile(ctx, "../bad")).rejects.toThrow(ValidationError);
  });
});
