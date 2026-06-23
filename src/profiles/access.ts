import type { GatewayContext } from "../config/context.js";
import { isValidRoleArn } from "../aws/credentials/helpers.js";
import type { AwsCredentials } from "../aws/types.js";
import { ValidationError } from "../security/errors.js";
import { buildProfileKey } from "./keys.js";
import { listApplicationProfiles, loadApplicationProfile } from "./loader.js";
import type { ProfileAuthConfig, ValidatedAppProfile } from "./types.js";
import { resolveProfileAuth, validateProfileId } from "./validation.js";

export type AuthStrategyLabel = "default" | "assume-role";

export function authStrategyLabel(
  blockAuth: ProfileAuthConfig | undefined,
  profileAuth: ProfileAuthConfig | undefined,
): AuthStrategyLabel {
  const request = resolveProfileAuth(blockAuth ?? profileAuth);
  return request.strategy === "assume-role" ? "assume-role" : "default";
}

export async function resolveBlockCredentials(
  ctx: GatewayContext,
  profile: ValidatedAppProfile,
  blockAuth?: ProfileAuthConfig,
): Promise<AwsCredentials> {
  const request = resolveProfileAuth(blockAuth ?? profile.auth);
  if (request.strategy === "default") {
    return ctx.credentials;
  }

  if (!isValidRoleArn(request.roleArn)) {
    throw new ValidationError(
      "validation_error",
      "roleArn must be a valid IAM role ARN (arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME).",
    );
  }

  return ctx.credentialResolver.resolve(request);
}

export async function isProfileConfigAvailable(
  ctx: GatewayContext,
  profileId: string,
): Promise<boolean> {
  if (!ctx.appConfig) {
    return false;
  }

  const safeProfileId = validateProfileId(profileId);
  const profileKey = buildProfileKey(safeProfileId);

  try {
    const value = await ctx.appConfig.get(profileKey, "json");
    return value !== null;
  } catch {
    return false;
  }
}

export async function resolveApplicationProfileForTool(
  ctx: GatewayContext,
  profileId: string,
): Promise<ValidatedAppProfile> {
  const listResult = await listApplicationProfiles(ctx);

  if (listResult.status === "disabled") {
    throw new ValidationError(
      "validation_error",
      "Application profiles are not configured.",
    );
  }
  if (listResult.status === "unavailable") {
    throw new ValidationError(
      "validation_error",
      "Application profiles are temporarily unavailable.",
    );
  }

  const safeProfileId = validateProfileId(profileId);
  const entry = listResult.profiles.find((profile) => profile.id === safeProfileId);
  if (!entry) {
    throw new ValidationError(
      "validation_error",
      `Application profile not found: ${safeProfileId}.`,
    );
  }
  if (!entry.enabled) {
    throw new ValidationError(
      "validation_error",
      `Application profile is disabled: ${safeProfileId}.`,
    );
  }

  return loadApplicationProfile(ctx, safeProfileId);
}
