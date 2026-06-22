import { describe, expect, it } from "vitest";
import { buildClaimDiagnostics, buildScopeDiagnostics } from "./diagnostics.js";

describe("buildClaimDiagnostics", () => {
  it("exposes claim key names and flags without claim values", () => {
    const diagnostics = buildClaimDiagnostics({
      sub: "user-123-secret",
      scope: "aws:read openid",
      aud: "https://api.example.com",
      iss: "https://issuer.example.com",
      exp: 1_700_000_000,
    });

    expect(diagnostics).toEqual({
      claimKeys: ["aud", "exp", "iss", "scope", "sub"],
      hasScopeClaim: true,
      hasScpClaim: false,
      hasPermissionsClaim: false,
      hasAudienceClaim: true,
      hasIssuerClaim: true,
      hasExpirationClaim: true,
      hasSubjectClaim: true,
    });

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("user-123-secret");
    expect(serialized).not.toContain("aws:read");
    expect(serialized).not.toContain("https://api.example.com");
    expect(serialized).not.toContain("https://issuer.example.com");
  });
});

describe("buildScopeDiagnostics", () => {
  it("exposes scope lists and flags without unrelated claim values", () => {
    const diagnostics = buildScopeDiagnostics(
      {
        sub: "user-secret-123",
        scope: "aws:read openid",
        aud: "https://api.example.com",
        scp: ["aws:read"],
      },
      ["aws:read", "aws:write"],
    );

    expect(diagnostics.requiredScopes).toEqual(["aws:read", "aws:write"]);
    expect(diagnostics.extractedScopes).toEqual(["aws:read", "openid"]);
    expect(diagnostics.hasScopeClaim).toBe(true);
    expect(diagnostics.hasScpClaim).toBe(true);
    expect(diagnostics.scopeFromScopeClaim).toBe(true);
    expect(diagnostics.scopeFromScpClaim).toBe(true);

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("user-secret-123");
    expect(serialized).not.toContain("https://api.example.com");
  });
});
