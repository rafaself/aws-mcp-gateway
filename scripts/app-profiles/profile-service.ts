import { ValidationError } from "../../src/security/errors.js";
import { buildProfileKey } from "../../src/profiles/keys.js";
import { validateProfileDocument } from "../../src/profiles/validation.js";
import type { AppProfileCliConfig } from "./lib/wrangler-config.js";
import {
  assertValidIndex,
  mergeProfileIntoIndex,
  parseIndexReadResult,
  removeProfileFromIndex,
} from "./lib/index-operations.js";
import {
  createWranglerKvStore,
  readJsonFromKv,
  readProfileFile,
  writeJsonToKv,
  type AppProfileKvStore,
} from "./lib/kv-store.js";
import { formatProfileIndex, formatDeletePreview } from "./lib/profile-output.js";

export type KvRuntimeOptions = {
  configPath: string;
  env?: string;
  remote: boolean;
};

export function createKvStoreForCli(options: KvRuntimeOptions, cliConfig: AppProfileCliConfig): AppProfileKvStore {
  if (!cliConfig.hasAppConfigBinding) {
    throw new Error(`Missing ${"AWS_MCP_APP_CONFIG"} binding in wrangler config.`);
  }

  return createWranglerKvStore({
    configPath: cliConfig.configPath,
    env: options.env,
    remote: options.remote,
  });
}

export async function validateProfileFromFile(
  filePath: string,
  allowedRegions: string[],
  expectedProfileId?: string,
) {
  const { raw, parsed } = await readProfileFile(filePath);
  const profileId =
    expectedProfileId ??
    (typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof (parsed as Record<string, unknown>).id === "string"
      ? String((parsed as Record<string, unknown>).id)
      : undefined);

  if (!profileId) {
    throw new Error("Profile id is required. Provide --profile-id or include id in the JSON file.");
  }

  return validateProfileDocument(
    parsed,
    profileId,
    allowedRegions,
    Buffer.byteLength(raw, "utf8"),
  );
}

export async function readValidatedIndex(
  kv: AppProfileKvStore,
  indexKey: string,
  allowedRegions: string[],
) {
  const result = await readJsonFromKv<unknown>(kv, indexKey);
  const parsed = parseIndexReadResult(result.exists, result.raw, result.parsed, allowedRegions);

  if (parsed.status === "invalid") {
    throw new Error(`Profile index is invalid and cannot be modified: ${parsed.message}`);
  }

  return parsed;
}

export async function putProfileToKv(
  kv: AppProfileKvStore,
  cliConfig: AppProfileCliConfig,
  filePath: string,
) {
  const profile = await validateProfileFromFile(filePath, cliConfig.allowedRegions);
  const profileKey = buildProfileKey(profile.id);
  const indexRead = await readValidatedIndex(kv, cliConfig.indexKey, cliConfig.allowedRegions);
  const nextIndex = mergeProfileIntoIndex(indexRead.index, profile);
  const validatedIndex = assertValidIndex(nextIndex, cliConfig.allowedRegions);

  await writeJsonToKv(kv, profileKey, profile);
  await writeJsonToKv(kv, cliConfig.indexKey, validatedIndex);

  return {
    profileId: profile.id,
    profileKey,
    indexKey: cliConfig.indexKey,
    indexEntryCount: validatedIndex.profiles.length,
  };
}

export async function listProfilesFromKv(kv: AppProfileKvStore, cliConfig: AppProfileCliConfig) {
  const result = await readJsonFromKv<unknown>(kv, cliConfig.indexKey);
  const parsed = parseIndexReadResult(
    result.exists,
    result.raw,
    result.parsed,
    cliConfig.allowedRegions,
  );

  if (parsed.status === "invalid") {
    throw new Error(`Profile index is invalid: ${parsed.message}`);
  }

  return parsed.index;
}

export async function deleteProfileFromKv(
  kv: AppProfileKvStore,
  cliConfig: AppProfileCliConfig,
  profileId: string,
  confirmed: boolean,
) {
  const profileKey = buildProfileKey(profileId);
  const indexRead = await readValidatedIndex(kv, cliConfig.indexKey, cliConfig.allowedRegions);
  const existsInIndex = indexRead.index.profiles.some((entry) => entry.id === profileId);

  if (!confirmed) {
    return {
      confirmed: false,
      preview: formatDeletePreview(profileId, profileKey, cliConfig.indexKey),
    };
  }

  if (!existsInIndex) {
    throw new ValidationError("validation_error", `Application profile not found in index: ${profileId}.`);
  }

  const nextIndex = removeProfileFromIndex(indexRead.index, profileId);
  const validatedIndex = assertValidIndex(nextIndex, cliConfig.allowedRegions);

  await kv.delete(profileKey);
  await writeJsonToKv(kv, cliConfig.indexKey, validatedIndex);

  return {
    confirmed: true,
    profileId,
    profileKey,
    indexKey: cliConfig.indexKey,
    indexEntryCount: validatedIndex.profiles.length,
  };
}

export function formatListedProfiles(cliConfig: AppProfileCliConfig, index: Awaited<ReturnType<typeof listProfilesFromKv>>) {
  return [
    `indexKey: ${cliConfig.indexKey}`,
    formatProfileIndex(index),
  ].join("\n");
}
