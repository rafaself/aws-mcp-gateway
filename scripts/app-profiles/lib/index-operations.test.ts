import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../src/security/errors.js";
import { buildProfileKey, resolveIndexKey } from "../../../src/profiles/keys.js";
import {
  buildIndexEntryFromProfile,
  deriveCapabilitiesFromResources,
  mergeProfileIntoIndex,
  parseIndexReadResult,
  removeProfileFromIndex,
} from "./index-operations.js";
import type { ValidatedAppProfile } from "../../../src/profiles/types.js";

const ALLOWED_REGIONS = ["us-east-1", "sa-east-1"];

const validProfile: ValidatedAppProfile = {
  version: 1,
  id: "example-prod",
  displayName: "Example Production",
  environment: "production",
  region: "us-east-1",
  auth: { strategy: "default" },
  resources: {
    ecs: {
      clusterName: "example-production",
      serviceName: "example-production-api",
      logGroupName: "/ecs/example-production",
      containers: ["api"],
    },
    rds: {
      dbInstanceIdentifier: "example-production",
    },
  },
};

describe("deriveCapabilitiesFromResources", () => {
  it("derives sorted resource block names", () => {
    expect(deriveCapabilitiesFromResources(validProfile.resources)).toEqual(["ecs", "rds"]);
  });
});

describe("buildIndexEntryFromProfile", () => {
  it("creates defaults for new profiles", () => {
    const entry = buildIndexEntryFromProfile(validProfile);
    expect(entry).toEqual({
      id: "example-prod",
      displayName: "Example Production",
      environment: "production",
      region: "us-east-1",
      enabled: true,
      aliases: [],
      capabilities: ["ecs", "rds"],
    });
  });

  it("preserves enabled, aliases, and capabilities on update", () => {
    const existing = {
      id: "example-prod",
      displayName: "Old Name",
      environment: "production",
      region: "us-east-1",
      enabled: false,
      aliases: ["prod"],
      capabilities: ["ecs", "rds", "logs"],
    };

    const entry = buildIndexEntryFromProfile(
      { ...validProfile, displayName: "Example Production" },
      existing,
    );

    expect(entry.enabled).toBe(false);
    expect(entry.aliases).toEqual(["prod"]);
    expect(entry.capabilities).toEqual(["ecs", "rds", "logs"]);
    expect(entry.displayName).toBe("Example Production");
  });
});

describe("mergeProfileIntoIndex", () => {
  it("adds a new profile and keeps existing entries", () => {
    const current = {
      version: 1 as const,
      profiles: [
        {
          id: "other",
          displayName: "Other",
          environment: "staging",
          region: "us-east-1",
          enabled: true,
          aliases: [],
          capabilities: ["ecs"],
        },
      ],
    };

    const merged = mergeProfileIntoIndex(current, validProfile);
    expect(merged.profiles.map((entry) => entry.id)).toEqual(["example-prod", "other"]);
  });

  it("updates an existing profile entry", () => {
    const current = {
      version: 1 as const,
      profiles: [
        {
          id: "example-prod",
          displayName: "Old",
          environment: "production",
          region: "us-east-1",
          enabled: false,
          aliases: ["prod"],
          capabilities: ["ecs"],
        },
      ],
    };

    const merged = mergeProfileIntoIndex(current, validProfile);
    expect(merged.profiles).toHaveLength(1);
    expect(merged.profiles[0]?.displayName).toBe("Example Production");
    expect(merged.profiles[0]?.enabled).toBe(false);
    expect(merged.profiles[0]?.aliases).toEqual(["prod"]);
  });
});

describe("removeProfileFromIndex", () => {
  it("removes only the requested profile", () => {
    const current = {
      version: 1 as const,
      profiles: [
        {
          id: "example-prod",
          displayName: "Example Production",
          environment: "production",
          region: "us-east-1",
          enabled: true,
          aliases: [],
          capabilities: ["ecs"],
        },
        {
          id: "other",
          displayName: "Other",
          environment: "staging",
          region: "us-east-1",
          enabled: true,
          aliases: [],
          capabilities: ["ecs"],
        },
      ],
    };

    const next = removeProfileFromIndex(current, "example-prod");
    expect(next.profiles.map((entry) => entry.id)).toEqual(["other"]);
  });
});

describe("parseIndexReadResult", () => {
  it("treats missing index as empty", () => {
    const result = parseIndexReadResult(false, null, null, ALLOWED_REGIONS);
    expect(result.status).toBe("missing");
    if (result.status === "missing") {
      expect(result.index.profiles).toEqual([]);
    }
  });

  it("accepts valid index JSON", () => {
    const raw = JSON.stringify({
      version: 1,
      profiles: [
        {
          id: "example-prod",
          displayName: "Example Production",
          environment: "production",
          region: "us-east-1",
          enabled: true,
          aliases: [],
          capabilities: ["ecs"],
        },
      ],
    });

    const result = parseIndexReadResult(true, raw, JSON.parse(raw), ALLOWED_REGIONS);
    expect(result.status).toBe("valid");
  });

  it("rejects malformed index without overwriting", () => {
    const raw = JSON.stringify({ version: 2, profiles: [] });
    const result = parseIndexReadResult(true, raw, JSON.parse(raw), ALLOWED_REGIONS);
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.message).toContain("version");
    }
  });
});

describe("profile key helpers", () => {
  it("builds canonical KV keys", () => {
    expect(buildProfileKey("example-prod")).toBe("app-profiles/profiles/example-prod.json");
    expect(resolveIndexKey()).toBe("app-profiles/index.json");
  });

  it("rejects unsafe profile ids for keys", () => {
    expect(() => buildProfileKey("../escape")).toThrow(ValidationError);
  });
});
