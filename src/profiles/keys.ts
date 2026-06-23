import { APP_PROFILE_DEFAULT_INDEX_KEY } from "../security/limits.js";
import { validateProfileId } from "./validation.js";

const PROFILE_KEY_PREFIX = "app-profiles/profiles/";

export function buildProfileKey(profileId: string): string {
  const safeId = validateProfileId(profileId);
  return `${PROFILE_KEY_PREFIX}${safeId}.json`;
}

export function resolveIndexKey(indexKey?: string): string {
  const trimmed = indexKey?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : APP_PROFILE_DEFAULT_INDEX_KEY;
}
