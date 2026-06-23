import type { ProfileIndex, ValidatedAppProfile } from "../../../src/profiles/types.js";
import { authStrategyLabel } from "../../../src/profiles/access.js";

export type ProfileValidationSummary = {
  id: string;
  displayName: string;
  environment: string;
  region: string;
  resourceBlocks: string[];
  authStrategies: string[];
};

export function buildProfileValidationSummary(profile: ValidatedAppProfile): ProfileValidationSummary {
  const resourceBlocks = Object.keys(profile.resources).sort();
  const authStrategies = new Set<string>();

  if (profile.auth) {
    authStrategies.add(authStrategyLabel(undefined, profile.auth));
  }

  for (const blockName of resourceBlocks) {
    const block = profile.resources[blockName as keyof ValidatedAppProfile["resources"]];
    if (block && typeof block === "object" && "auth" in block && block.auth) {
      authStrategies.add(authStrategyLabel(block.auth, profile.auth));
    }
  }

  return {
    id: profile.id,
    displayName: profile.displayName,
    environment: profile.environment,
    region: profile.region,
    resourceBlocks,
    authStrategies: [...authStrategies].sort(),
  };
}

export function formatProfileValidationSummary(summary: ProfileValidationSummary): string {
  const lines = [
    "Profile validation passed.",
    `id: ${summary.id}`,
    `displayName: ${summary.displayName}`,
    `environment: ${summary.environment}`,
    `region: ${summary.region}`,
    `resourceBlocks: ${summary.resourceBlocks.join(", ") || "(none)"}`,
    `authStrategies: ${summary.authStrategies.join(", ") || "(none)"}`,
  ];
  return lines.join("\n");
}

export function formatProfileIndex(index: ProfileIndex): string {
  if (index.profiles.length === 0) {
    return "No application profiles in index.";
  }

  const lines = [`Application profiles (${index.profiles.length}):`];
  for (const profile of index.profiles) {
    lines.push(
      [
        `- ${profile.id}`,
        `  displayName: ${profile.displayName}`,
        `  environment: ${profile.environment}`,
        `  region: ${profile.region}`,
        `  enabled: ${profile.enabled}`,
        `  aliases: ${profile.aliases.join(", ") || "(none)"}`,
        `  capabilities: ${profile.capabilities.join(", ") || "(none)"}`,
      ].join("\n"),
    );
  }
  return lines.join("\n");
}

export function formatDeletePreview(profileId: string, profileKey: string, indexKey: string): string {
  return [
    "Destructive operation requires confirmation.",
    `profileId: ${profileId}`,
    `profileKey: ${profileKey}`,
    `indexKey: ${indexKey}`,
    "Re-run with --yes to delete the profile and update the index.",
  ].join("\n");
}
