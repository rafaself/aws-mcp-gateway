import type { ProfileIndex, SafeProfileIndexEntry, ValidatedAppProfile } from "../../../src/profiles/types.js";
import { validateProfileIndexDocument } from "../../../src/profiles/validation.js";

export const EMPTY_PROFILE_INDEX: ProfileIndex = {
  version: 1,
  profiles: [],
};

export function deriveCapabilitiesFromResources(
  resources: ValidatedAppProfile["resources"],
): string[] {
  return Object.keys(resources).sort();
}

export function buildIndexEntryFromProfile(
  profile: ValidatedAppProfile,
  existing?: SafeProfileIndexEntry,
): SafeProfileIndexEntry {
  if (existing) {
    return {
      id: profile.id,
      displayName: profile.displayName,
      environment: profile.environment,
      region: profile.region,
      enabled: existing.enabled,
      aliases: existing.aliases,
      capabilities: existing.capabilities,
    };
  }

  return {
    id: profile.id,
    displayName: profile.displayName,
    environment: profile.environment,
    region: profile.region,
    enabled: true,
    aliases: [],
    capabilities: deriveCapabilitiesFromResources(profile.resources),
  };
}

export type IndexReadResult =
  | { status: "missing"; index: ProfileIndex }
  | { status: "valid"; index: ProfileIndex; raw: string }
  | { status: "invalid"; message: string };

export function parseIndexReadResult(
  exists: boolean,
  raw: string | null,
  parsed: unknown,
  allowedRegions: string[],
): IndexReadResult {
  if (!exists || raw === null || parsed === null) {
    return { status: "missing", index: EMPTY_PROFILE_INDEX };
  }

  try {
    const index = validateProfileIndexDocument(parsed, allowedRegions, Buffer.byteLength(raw, "utf8"));
    return { status: "valid", index, raw };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Profile index validation failed.";
    return { status: "invalid", message };
  }
}

export function mergeProfileIntoIndex(
  current: ProfileIndex,
  profile: ValidatedAppProfile,
): ProfileIndex {
  const existing = current.profiles.find((entry) => entry.id === profile.id);
  const nextEntry = buildIndexEntryFromProfile(profile, existing);
  const remaining = current.profiles.filter((entry) => entry.id !== profile.id);

  return {
    version: 1,
    profiles: [...remaining, nextEntry].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function removeProfileFromIndex(current: ProfileIndex, profileId: string): ProfileIndex {
  return {
    version: 1,
    profiles: current.profiles.filter((entry) => entry.id !== profileId),
  };
}

export function assertValidIndex(index: ProfileIndex, allowedRegions: string[]): ProfileIndex {
  return validateProfileIndexDocument(index, allowedRegions);
}
