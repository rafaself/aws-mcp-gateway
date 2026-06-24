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

export const INVALID_PROFILE_INDEX_ERROR = "Application profile index is invalid.";

type KvReadResult = {
  value: unknown;
  status: ProfileStoreStatus;
};

type KvIndexReadResult = {
  value: unknown;
  status: ProfileStoreStatus;
  error?: string;
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

async function readKvIndex(
  kv: KVNamespace | undefined,
  key: string,
): Promise<KvIndexReadResult> {
  if (!kv) {
    return { value: null, status: "disabled" };
  }

  try {
    const raw = await kv.get(key, "text");
    if (raw === null) {
      return { value: null, status: "available" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logWarn({ phase: "app_profile_index_invalid" });
      return {
        value: null,
        status: "invalid",
        error: INVALID_PROFILE_INDEX_ERROR,
      };
    }

    return { value: parsed, status: "available" };
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
  if (status === "invalid") {
    throw new ValidationError("validation_error", INVALID_PROFILE_INDEX_ERROR);
  }
}

function invalidIndexResult(): ListApplicationProfilesResult {
  return {
    status: "invalid",
    profiles: [],
    error: INVALID_PROFILE_INDEX_ERROR,
  };
}

export async function listApplicationProfiles(
  ctx: GatewayContext,
): Promise<ListApplicationProfilesResult> {
  const indexKey = resolveIndexKey(ctx.appProfileIndexKey);
  const result = await readKvIndex(ctx.appConfig, indexKey);

  if (result.status === "disabled") {
    return { status: "disabled", profiles: [] };
  }
  if (result.status === "unavailable") {
    return { status: "unavailable", profiles: [] };
  }
  if (result.status === "invalid") {
    return invalidIndexResult();
  }
  if (result.value === null) {
    return { status: "available", profiles: [] };
  }

  try {
    const index = validateProfileIndexDocument(result.value, ctx.allowedRegions);
    return { status: "available", profiles: index.profiles };
  } catch {
    logWarn({ phase: "app_profile_index_invalid" });
    return invalidIndexResult();
  }
}

export async function loadApplicationProfile(
  ctx: GatewayContext,
  profileId: string,
): Promise<ValidatedAppProfile> {
  const safeProfileId = validateProfileId(profileId);
  const indexKey = resolveIndexKey(ctx.appProfileIndexKey);
  const indexResult = await readKvIndex(ctx.appConfig, indexKey);
  assertProfilesConfigured(indexResult.status);

  if (indexResult.value !== null) {
    try {
      validateProfileIndexDocument(indexResult.value, ctx.allowedRegions);
    } catch {
      throw new ValidationError("validation_error", INVALID_PROFILE_INDEX_ERROR);
    }
  }

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
