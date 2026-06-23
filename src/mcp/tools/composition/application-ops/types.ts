import type { GatewayContext } from "../../../../config/context.js";
import type { ValidatedAppProfile } from "../../../../profiles/types.js";
import { validateRegion } from "../../../../security/regions.js";

export type ApplicationProfileSummary = {
  id: string;
  displayName: string;
  environment: string;
  region: string;
};

export type SectionStatus = "ok" | "skipped" | "error";

export type SectionResult<T> = {
  configured: boolean;
  status: SectionStatus;
  authStrategy?: "default" | "assume-role";
  data?: T;
  error?: string;
};

export type ApplicationOpsContext = {
  ctx: GatewayContext;
  profile: ValidatedAppProfile;
  region: string;
};

export function buildApplicationOpsContext(
  ctx: GatewayContext,
  profile: ValidatedAppProfile,
): ApplicationOpsContext {
  validateRegion(profile.region, ctx.allowedRegions);
  return { ctx, profile, region: profile.region };
}

export function profileSummary(profile: ValidatedAppProfile): ApplicationProfileSummary {
  return {
    id: profile.id,
    displayName: profile.displayName,
    environment: profile.environment,
    region: profile.region,
  };
}

export function sectionError(message: string): SectionResult<never> {
  return {
    configured: true,
    status: "error",
    error: message,
  };
}

export function sectionSkipped(): SectionResult<never> {
  return {
    configured: false,
    status: "skipped",
  };
}

export function sectionOk<T>(
  data: T,
  authStrategy?: "default" | "assume-role",
): SectionResult<T> {
  return {
    configured: true,
    status: "ok",
    ...(authStrategy ? { authStrategy } : {}),
    data,
  };
}

export function redactErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return "Request failed.";
}
