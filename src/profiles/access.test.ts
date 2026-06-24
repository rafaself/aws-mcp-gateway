import { describe, expect, it, vi } from "vitest";
import type { KVNamespace } from "@cloudflare/workers-types";
import { ValidationError } from "../security/errors.js";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import {
  authStrategyLabel,
  isProfileConfigAvailable,
  resolveApplicationProfileForTool,
  resolveBlockCredentials,
  resolveSectionCredentials,
} from "./access.js";

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
    {
      id: "example-staging",
      displayName: "Example Staging",
      environment: "staging",
      region: "us-east-1",
      enabled: false,
      aliases: [],
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

describe("resolveBlockCredentials", () => {
  it("returns default credentials when no auth override is configured", async () => {
    const ctx = createTestGatewayContext();
    const credentials = await resolveBlockCredentials(ctx, {
      version: 1,
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      resources: { ecs: { clusterName: "c", serviceName: "s" } },
    });

    expect(credentials).toBe(ctx.credentials);
  });

  it("uses profile-level assume-role strategy", async () => {
    const resolve = vi.fn(async () => ({
      accessKeyId: "ASIA-test",
      secretAccessKey: "temp",
      sessionToken: "token",
    }));
    const ctx = createTestGatewayContext({
      credentialResolver: { resolve },
    });

    await resolveBlockCredentials(ctx, {
      version: 1,
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      auth: {
        strategy: "assume-role",
        roleArn: "arn:aws:iam::123456789012:role/ReadOnly",
      },
      resources: { ecs: { clusterName: "c", serviceName: "s" } },
    });

    expect(resolve).toHaveBeenCalledWith({
      strategy: "assume-role",
      roleArn: "arn:aws:iam::123456789012:role/ReadOnly",
    });
  });

  it("prefers block-level auth override over profile auth", async () => {
    const resolve = vi.fn(async () => ({
      accessKeyId: "ASIA-test",
      secretAccessKey: "temp",
      sessionToken: "token",
    }));
    const ctx = createTestGatewayContext({
      credentialResolver: { resolve },
    });

    await resolveBlockCredentials(
      ctx,
      {
        version: 1,
        id: "example-prod",
        displayName: "Example Production",
        environment: "production",
        region: "us-east-1",
        auth: {
          strategy: "assume-role",
          roleArn: "arn:aws:iam::123456789012:role/ProfileRole",
        },
        resources: { ecs: { clusterName: "c", serviceName: "s" } },
      },
      {
        strategy: "assume-role",
        roleArn: "arn:aws:iam::123456789012:role/BlockRole",
      },
    );

    expect(resolve).toHaveBeenCalledWith({
      strategy: "assume-role",
      roleArn: "arn:aws:iam::123456789012:role/BlockRole",
    });
  });
});

describe("authStrategyLabel", () => {
  it("returns assume-role when block auth overrides profile default", () => {
    expect(
      authStrategyLabel(
        { strategy: "assume-role", roleArn: "arn:aws:iam::123456789012:role/SesReadOnly" },
        { strategy: "default" },
      ),
    ).toBe("assume-role");
  });
});

describe("resolveSectionCredentials", () => {
  it("returns credentials and auth strategy for a resource block", async () => {
    const resolve = vi.fn(async () => ({
      accessKeyId: "ASIA-test",
      secretAccessKey: "temp",
      sessionToken: "token",
    }));
    const ctx = createTestGatewayContext({
      credentialResolver: { resolve },
    });

    const result = await resolveSectionCredentials(
      ctx,
      {
        version: 1,
        id: "example-prod",
        displayName: "Example Production",
        environment: "production",
        region: "us-east-1",
        auth: { strategy: "default" },
        resources: {
          sns: {
            topicName: "alerts",
            auth: {
              strategy: "assume-role",
              roleArn: "arn:aws:iam::123456789012:role/SnsReadOnly",
            },
          },
        },
      },
      {
        auth: {
          strategy: "assume-role",
          roleArn: "arn:aws:iam::123456789012:role/SnsReadOnly",
        },
      },
    );

    expect(result.authStrategy).toBe("assume-role");
    expect(resolve).toHaveBeenCalledWith({
      strategy: "assume-role",
      roleArn: "arn:aws:iam::123456789012:role/SnsReadOnly",
    });
  });
});

describe("isProfileConfigAvailable", () => {
  it("returns false when app config binding is missing", async () => {
    const ctx = createTestGatewayContext();
    await expect(isProfileConfigAvailable(ctx, "example-prod")).resolves.toBe(false);
  });

  it("returns true when profile document exists", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    await expect(isProfileConfigAvailable(ctx, "example-prod")).resolves.toBe(true);
  });
});

describe("resolveApplicationProfileForTool", () => {
  it("rejects when profiles are not configured", async () => {
    const ctx = createTestGatewayContext();
    await expect(resolveApplicationProfileForTool(ctx, "example-prod")).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects when profile index is invalid", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": { version: 2, profiles: [] },
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    await expect(resolveApplicationProfileForTool(ctx, "example-prod")).rejects.toThrow(
      /index is invalid/i,
    );
  });

  it("rejects missing profile ids", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
      }),
    });
    await expect(resolveApplicationProfileForTool(ctx, "missing-profile")).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects disabled profiles", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-staging.json": {
          ...validProfile,
          id: "example-staging",
        },
      }),
    });
    await expect(resolveApplicationProfileForTool(ctx, "example-staging")).rejects.toThrow(
      /disabled/i,
    );
  });

  it("loads enabled profiles from KV", async () => {
    const ctx = createTestGatewayContext({
      appConfig: createMockKv({
        "app-profiles/index.json": validIndex,
        "app-profiles/profiles/example-prod.json": validProfile,
      }),
    });
    const profile = await resolveApplicationProfileForTool(ctx, "example-prod");
    expect(profile.id).toBe("example-prod");
  });
});
