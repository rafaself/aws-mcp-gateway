import { describe, expect, it, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { createTestGatewayContext } from "../../../test/gateway-context-fixture.js";
import { INVALID_PROFILE_INDEX_ERROR } from "../../../profiles/loader.js";
import { createListApplicationProfilesToolManifest } from "./list-application-profiles.js";

const validIndex = {
  version: 1,
  profiles: [
    {
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      enabled: true,
      aliases: ["prod"],
      capabilities: ["ecs"],
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

describe("list_application_profiles tool", () => {
  it("returns disabled store state without KV binding", async () => {
    const ctx = createTestGatewayContext();
    const manifest = createListApplicationProfilesToolManifest(ctx);
    const result = await manifest.handler({});

    expect(result.structuredContent).toEqual({
      storeStatus: "disabled",
      profiles: [],
    });
  });

  it("returns empty list when index is missing", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({}),
    });
    const manifest = createListApplicationProfilesToolManifest(ctx);
    const result = await manifest.handler({});

    expect(result.structuredContent).toEqual({
      storeStatus: "available",
      profiles: [],
    });
  });

  it("returns invalid store state for malformed index", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": { version: 2, profiles: [] },
      }),
    });
    const manifest = createListApplicationProfilesToolManifest(ctx);
    const result = await manifest.handler({});

    expect(result.structuredContent).toEqual({
      storeStatus: "invalid",
      profiles: [],
      error: INVALID_PROFILE_INDEX_ERROR,
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain("version");
  });

  it("returns profile metadata with profileConfigAvailable", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    const manifest = createListApplicationProfilesToolManifest(ctx);
    const result = await manifest.handler({});

    expect(result.structuredContent).toMatchObject({
      storeStatus: "available",
      profiles: [
        expect.objectContaining({
          id: "example-prod",
          profileConfigAvailable: true,
        }),
      ],
    });
  });
});
