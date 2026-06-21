import { extractScopes } from "./scopes.js";

const MAX_CLAIM_KEYS = 50;

function claimContributesScopes(claims: Record<string, unknown>, claimKey: string): boolean {
  const value = claims[claimKey];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.length > 0);
  }
  return false;
}

export function buildClaimDiagnostics(claims: Record<string, unknown>): {
  claimKeys: string[];
  hasScopeClaim: boolean;
  hasScpClaim: boolean;
  hasPermissionsClaim: boolean;
  hasAudienceClaim: boolean;
  hasIssuerClaim: boolean;
  hasExpirationClaim: boolean;
  hasSubjectClaim: boolean;
} {
  return {
    claimKeys: Object.keys(claims).sort().slice(0, MAX_CLAIM_KEYS),
    hasScopeClaim: "scope" in claims,
    hasScpClaim: "scp" in claims,
    hasPermissionsClaim: "permissions" in claims,
    hasAudienceClaim: "aud" in claims || "resource" in claims,
    hasIssuerClaim: "iss" in claims,
    hasExpirationClaim: "exp" in claims,
    hasSubjectClaim: "sub" in claims,
  };
}

export function buildScopeDiagnostics(
  claims: Record<string, unknown>,
  requiredScopes: string[],
): {
  requiredScopes: string[];
  extractedScopes: string[];
  claimKeys: string[];
  hasScopeClaim: boolean;
  hasScpClaim: boolean;
  hasPermissionsClaim: boolean;
  scopeFromScopeClaim: boolean;
  scopeFromScpClaim: boolean;
  scopeFromPermissionsClaim: boolean;
} {
  const claimDiagnostics = buildClaimDiagnostics(claims);
  const extractedScopes = extractScopes(claims).slice(0, MAX_CLAIM_KEYS);

  return {
    requiredScopes: requiredScopes.slice(0, MAX_CLAIM_KEYS),
    extractedScopes,
    claimKeys: claimDiagnostics.claimKeys,
    hasScopeClaim: claimDiagnostics.hasScopeClaim,
    hasScpClaim: claimDiagnostics.hasScpClaim,
    hasPermissionsClaim: claimDiagnostics.hasPermissionsClaim,
    scopeFromScopeClaim: claimContributesScopes(claims, "scope"),
    scopeFromScpClaim: claimContributesScopes(claims, "scp"),
    scopeFromPermissionsClaim: claimContributesScopes(claims, "permissions"),
  };
}
