import type { KVNamespace } from "@cloudflare/workers-types";
import type { GatewayContext } from "../config/context.js";
import { ValidationError } from "../security/errors.js";
import { logWarn } from "../observability/logging.js";
import { buildProfileKey, resolveIndexKey } from "./keys.js";
import type {
  ListApplicationProfilesResult,
  ProfileStoreStatus,
  ValidatedAppProfile,
} from "./types.js";
import {
  validateProfileDocument,
  validateProfileId,
  validateProfileIndexDocument,
} from "./validation.js";

type KvReadResult = {
  value: unknown;
  status: ProfileStoreStatus;
};

async function readKvJson(
  kv: KVNamespace | undefined,
  key: string,
): Promise<KvReadResult> {
  if (!kv) {
    return { value: null, status: "disabled" };
  }

  try {
    const value = await kv.get(key, "json");
    if (value === null) {
      return { value: null, status: "available" };
    }
    return { value, status: "available" };
  } catch {
    logWarn({ phase: "app_profile_kv_read_failed", operation: "get" });
    return { value: null, status: "unavailable" };
  }
}

function assertProfilesConfigured(status: ProfileStoreStatus): void {
  if (status === "disabled") {
    throw new ValidationError(
      "validation_error",
      "Application profiles are not configured.",
    );
  }
  if (status === "unavailable") {
    throw new ValidationError(
      "validation_error",
      "Application profiles are temporarily unavailable.",
    );
  }
}

export async function listApplicationProfiles(
  ctx: GatewayContext,
): Promise<ListApplicationProfilesResult> {
  const indexKey = resolveIndexKey(ctx.appProfileIndexKey);
  const result = await readKvJson(ctx.appConfig, indexKey);

  if (result.status === "disabled") {
    return { status: "disabled", profiles: [] };
  }
  if (result.status === "unavailable") {
    return { status: "unavailable", profiles: [] };
  }
  if (result.value === null) {
    return { status: "available", profiles: [] };
  }

  try {
    const index = validateProfileIndexDocument(result.value, ctx.allowedRegions);
    return { status: "available", profiles: index.profiles };
  } catch (error) {
    logWarn({ phase: "app_profile_index_invalid" });
    return { status: "available", profiles: [] };
  }
}

export async function loadApplicationProfile(
  ctx: GatewayContext,
  profileId: string,
): Promise<ValidatedAppProfile> {
  const safeProfileId = validateProfileId(profileId);
  const indexKey = resolveIndexKey(ctx.appProfileIndexKey);
  const indexResult = await readKvJson(ctx.appConfig, indexKey);
  assertProfilesConfigured(indexResult.status);

  const profileKey = buildProfileKey(safeProfileId);
  const profileResult = await readKvJson(ctx.appConfig, profileKey);
  assertProfilesConfigured(profileResult.status);

  if (profileResult.value === null) {
    throw new ValidationError(
      "validation_error",
      `Application profile not found: ${safeProfileId}.`,
    );
  }

  return validateProfileDocument(
    profileResult.value,
    safeProfileId,
    ctx.allowedRegions,
  );
}
