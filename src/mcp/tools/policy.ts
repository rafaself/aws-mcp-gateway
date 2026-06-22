import type { AuthMode } from "../../config/env.js";
import type { GatewayContext } from "../../config/context.js";
import { GatewayError } from "../../errors/public-error.js";
import { resolveRegions, validateAllowedRegions, validateRegion } from "../../security/regions.js";
import { ValidationError } from "../../security/errors.js";
import { hasRequiredScopes } from "../../auth/oauth/scopes.js";
import { KNOWN_TOOL_PACKS } from "../../config/tool-exposure.js";
import { DEFAULT_AUTH_SCOPES, type AnyToolManifest, type ToolPack, type ToolRiskLevel } from "./manifest.js";
import { resolveExposedToolNames } from "./packs.js";
import {
  validateCostControlManifest,
  validateCostControlRequest,
} from "./cost-control-policy.js";

export type ToolPolicyContext = {
  enabledToolNames: ReadonlySet<string>;
  enabledPacks: ReadonlySet<ToolPack>;
  maxRiskLevel: ToolRiskLevel;
  allowedAwsServices: ReadonlySet<string>;
  allowedAwsActions: ReadonlySet<string>;
  allowedRegions: readonly string[];
  authMode: AuthMode;
  requiredScopes: readonly string[];
  grantedScopes: readonly string[];
};

export type ToolPolicyContextOverrides = Partial<{
  enabledToolNames: ReadonlySet<string>;
  enabledPacks: ReadonlySet<ToolPack>;
  maxRiskLevel: ToolRiskLevel;
  allowedAwsServices: ReadonlySet<string>;
  allowedAwsActions: ReadonlySet<string>;
  grantedScopes: readonly string[];
}>;

export function isAwsBackedManifest(manifest: AnyToolManifest): boolean {
  return manifest.descriptorKind === "aws-readonly";
}

export function buildToolPolicyContext(
  ctx: GatewayContext,
  manifests: ReadonlyArray<AnyToolManifest>,
  overrides?: ToolPolicyContextOverrides,
): ToolPolicyContext {
  const exposure = ctx.toolExposure;
  const enabledToolNames =
    overrides?.enabledToolNames ?? resolveExposedToolNames(manifests, exposure);
  const enabledPacks = overrides?.enabledPacks ?? exposure.enabledToolPacks;
  const maxRiskLevel = overrides?.maxRiskLevel ?? exposure.maxRiskLevel;

  const exposedManifests = manifests.filter((manifest) => enabledToolNames.has(manifest.name));

  return {
    enabledToolNames,
    enabledPacks,
    maxRiskLevel,
    allowedAwsServices:
      overrides?.allowedAwsServices ??
      new Set(exposedManifests.flatMap((manifest) => manifest.aws.services)),
    allowedAwsActions:
      overrides?.allowedAwsActions ??
      new Set(exposedManifests.flatMap((manifest) => manifest.aws.actions)),
    allowedRegions: ctx.allowedRegions,
    authMode: ctx.authMode ?? "local-bearer",
    requiredScopes: ctx.oauthRequiredScopes ?? [...DEFAULT_AUTH_SCOPES],
    grantedScopes: overrides?.grantedScopes ?? ctx.grantedScopes ?? [...DEFAULT_AUTH_SCOPES],
  };
}

function policyDenial(message: string): GatewayError {
  return new GatewayError("validation_error", message);
}

function validateManifestStructure(manifest: AnyToolManifest): GatewayError | null {
  if (!manifest.name || typeof manifest.name !== "string") {
    return policyDenial("Tool manifest is malformed.");
  }

  if (!manifest.pack || !KNOWN_TOOL_PACKS.has(manifest.pack)) {
    return policyDenial("Tool manifest is malformed.");
  }

  if (!manifest.safety?.riskLevel) {
    return policyDenial("Tool manifest is malformed.");
  }

  if (manifest.aws?.readonly !== true) {
    return policyDenial("Tool manifest is malformed.");
  }

  return null;
}

function validateAwsMetadata(manifest: AnyToolManifest, policy: ToolPolicyContext): GatewayError | null {
  if (!isAwsBackedManifest(manifest)) {
    return null;
  }

  if (manifest.aws.services.length === 0 || manifest.aws.actions.length === 0) {
    return policyDenial("Tool is missing required AWS metadata.");
  }

  for (const service of manifest.aws.services) {
    if (!policy.allowedAwsServices.has(service)) {
      return policyDenial("Tool AWS service is not allowed.");
    }
  }

  for (const action of manifest.aws.actions) {
    if (!policy.allowedAwsActions.has(action)) {
      return policyDenial("Tool AWS action is not allowed.");
    }
  }

  return null;
}

function validateRequestedRegions(
  manifest: AnyToolManifest,
  policy: ToolPolicyContext,
  args: Record<string, unknown>,
): GatewayError | null {
  if (manifest.aws.regionMode === "none" || manifest.aws.regionMode === "global") {
    return null;
  }

  try {
    validateAllowedRegions([...policy.allowedRegions]);
  } catch (error) {
    if (error instanceof ValidationError) {
      return policyDenial(error.message);
    }
    throw error;
  }

  if (manifest.aws.regionMode === "single-region") {
    const region =
      manifest.audit.getRegion?.(args) ??
      (typeof args.region === "string" ? args.region : undefined);

    if (region) {
      try {
        validateRegion(region, [...policy.allowedRegions]);
      } catch (error) {
        if (error instanceof ValidationError) {
          return policyDenial(error.message);
        }
        throw error;
      }
    }

    return null;
  }

  if (manifest.aws.regionMode === "bounded-multi-region") {
    const requestedRegions = Array.isArray(args.regions)
      ? args.regions.filter((region): region is string => typeof region === "string")
      : undefined;

    if (requestedRegions && requestedRegions.length > 0) {
      try {
        resolveRegions(requestedRegions, [...policy.allowedRegions]);
      } catch (error) {
        if (error instanceof ValidationError) {
          return policyDenial(error.message);
        }
        throw error;
      }
    }
  }

  return null;
}

function validateGrantedScopes(
  manifest: AnyToolManifest,
  policy: ToolPolicyContext,
): GatewayError | null {
  const requiredScopes = manifest.auth?.requiredScopes;
  if (!Array.isArray(requiredScopes) || requiredScopes.length === 0) {
    return policyDenial("Tool manifest is malformed.");
  }

  if (!hasRequiredScopes([...policy.grantedScopes], [...requiredScopes])) {
    return policyDenial("Required scope is not granted.");
  }

  return null;
}

export function evaluateToolPolicy(
  manifest: AnyToolManifest,
  policy: ToolPolicyContext,
  args: Record<string, unknown>,
): GatewayError | null {
  const malformed = validateManifestStructure(manifest);
  if (malformed) {
    return malformed;
  }

  if (!policy.enabledToolNames.has(manifest.name)) {
    return policyDenial("Tool is not enabled.");
  }

  if (!policy.enabledPacks.has(manifest.pack)) {
    return policyDenial("Tool pack is not enabled.");
  }

  if (manifest.safety.riskLevel !== policy.maxRiskLevel) {
    return policyDenial("Tool risk level is not allowed.");
  }

  const scopeDenial = validateGrantedScopes(manifest, policy);
  if (scopeDenial) {
    return scopeDenial;
  }

  const awsMetadata = validateAwsMetadata(manifest, policy);
  if (awsMetadata) {
    return awsMetadata;
  }

  const costControlManifest = validateCostControlManifest(manifest);
  if (costControlManifest) {
    return costControlManifest;
  }

  const regionDenial = validateRequestedRegions(manifest, policy, args);
  if (regionDenial) {
    return regionDenial;
  }

  return validateCostControlRequest(manifest, policy, args);
}
