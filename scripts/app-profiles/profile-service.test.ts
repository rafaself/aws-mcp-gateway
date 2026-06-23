import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/security/errors.js";
import { buildProfileKey } from "../../src/profiles/keys.js";
import { createInMemoryKvStore } from "./lib/kv-store.js";
import {
  deleteProfileFromKv,
  listProfilesFromKv,
  putProfileToKv,
  validateProfileFromFile,
} from "./profile-service.js";
import type { AppProfileCliConfig } from "./lib/wrangler-config.js";
import {
  buildProfileValidationSummary,
  formatProfileValidationSummary,
} from "./lib/profile-output.js";

const ALLOWED_REGIONS = ["us-east-1", "sa-east-1"];

const validProfile = {
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

const cliConfig: AppProfileCliConfig = {
  configPath: "wrangler.jsonc",
  allowedRegions: ALLOWED_REGIONS,
  indexKey: "app-profiles/index.json",
  hasAppConfigBinding: true,
};

async function writeTempProfile(
  profile: unknown,
  filename = "profile.json",
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "app-profile-test-"));
  const filePath = join(dir, filename);
  await writeFile(filePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return filePath;
}

describe("validateProfileFromFile", () => {
  it("accepts a valid profile file", async () => {
    const filePath = await writeTempProfile(validProfile);
    const profile = await validateProfileFromFile(filePath, ALLOWED_REGIONS);
    expect(profile.id).toBe("example-prod");
  });

  it("rejects unsafe strings", async () => {
    const filePath = await writeTempProfile({
      ...validProfile,
      displayName: "password=secret",
    });
    await expect(validateProfileFromFile(filePath, ALLOWED_REGIONS)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects user ARN roleArn values", async () => {
    const filePath = await writeTempProfile({
      ...validProfile,
      resources: {
        ses: {
          configurationSetName: "example-production",
          auth: {
            strategy: "assume-role",
            roleArn: "arn:aws:iam::123456789012:user/SomeUser",
          },
        },
      },
    });
    await expect(validateProfileFromFile(filePath, ALLOWED_REGIONS)).rejects.toThrow(
      ValidationError,
    );
  });

  it("rejects profile id mismatch", async () => {
    const filePath = await writeTempProfile(validProfile);
    await expect(
      validateProfileFromFile(filePath, ALLOWED_REGIONS, "other-id"),
    ).rejects.toThrow(ValidationError);
  });
});

describe("profile validation output", () => {
  it("prints metadata only", async () => {
    const filePath = await writeTempProfile(validProfile);
    const profile = await validateProfileFromFile(filePath, ALLOWED_REGIONS);
    const summary = buildProfileValidationSummary(profile);
    const formatted = formatProfileValidationSummary(summary);

    expect(formatted).toContain("Profile validation passed.");
    expect(formatted).toContain("resourceBlocks: ecs, rds");
    expect(formatted).not.toContain("example-production-api");
    expect(formatted).not.toContain("roleArn");
  });
});

describe("put/list/delete profile service", () => {
  it("uploads profile and updates index while preserving other entries", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({
        version: 1,
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
      }),
    });

    const filePath = await writeTempProfile(validProfile);
    const result = await putProfileToKv(kv, cliConfig, filePath);
    expect(result.indexEntryCount).toBe(2);

    const index = await listProfilesFromKv(kv, cliConfig);
    expect(index.profiles.map((entry) => entry.id)).toEqual(["example-prod", "other"]);
    expect(await kv.get(buildProfileKey("example-prod"))).toContain("example-production");
  });

  it("preserves aliases and enabled on update", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({
        version: 1,
        profiles: [
          {
            id: "example-prod",
            displayName: "Old",
            environment: "production",
            region: "us-east-1",
            enabled: false,
            aliases: ["prod"],
            capabilities: ["ecs", "logs"],
          },
        ],
      }),
      [buildProfileKey("example-prod")]: JSON.stringify(validProfile),
    });

    const updatedProfile = {
      ...validProfile,
      displayName: "Example Production Updated",
    };
    const filePath = await writeTempProfile(updatedProfile);
    await putProfileToKv(kv, cliConfig, filePath);

    const index = await listProfilesFromKv(kv, cliConfig);
    const entry = index.profiles.find((profile) => profile.id === "example-prod");
    expect(entry?.displayName).toBe("Example Production Updated");
    expect(entry?.enabled).toBe(false);
    expect(entry?.aliases).toEqual(["prod"]);
    expect(entry?.capabilities).toEqual(["ecs", "logs"]);
  });

  it("lists an empty index when missing", async () => {
    const kv = createInMemoryKvStore();
    const index = await listProfilesFromKv(kv, cliConfig);
    expect(index.profiles).toEqual([]);
  });

  it("fails list on malformed index", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({ version: 2, profiles: [] }),
    });

    await expect(listProfilesFromKv(kv, cliConfig)).rejects.toThrow(/invalid/i);
  });

  it("fails put on malformed index", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({ version: 2, profiles: [] }),
    });
    const filePath = await writeTempProfile(validProfile);

    await expect(putProfileToKv(kv, cliConfig, filePath)).rejects.toThrow(/invalid/i);
  });

  it("requires confirmation before delete", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({
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
      }),
      [buildProfileKey("example-prod")]: JSON.stringify(validProfile),
    });

    const preview = await deleteProfileFromKv(kv, cliConfig, "example-prod", false);
    expect(preview.confirmed).toBe(false);
    expect(preview.preview).toContain("--yes");
    expect(await kv.get(buildProfileKey("example-prod"))).not.toBeNull();
  });

  it("deletes profile key and index entry with --yes", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({
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
      }),
      [buildProfileKey("example-prod")]: JSON.stringify(validProfile),
    });

    const result = await deleteProfileFromKv(kv, cliConfig, "example-prod", true);
    expect(result.confirmed).toBe(true);
    expect(result.indexEntryCount).toBe(0);
    expect(await kv.get(buildProfileKey("example-prod"))).toBeNull();
  });

  it("rejects delete when profile is missing from index", async () => {
    const kv = createInMemoryKvStore({
      "app-profiles/index.json": JSON.stringify({ version: 1, profiles: [] }),
    });

    await expect(deleteProfileFromKv(kv, cliConfig, "missing", true)).rejects.toThrow(
      ValidationError,
    );
  });
});
