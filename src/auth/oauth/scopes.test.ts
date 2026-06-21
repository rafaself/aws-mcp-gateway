import { describe, expect, it } from "vitest";
import { extractScopes, hasRequiredScopes } from "./scopes.js";

describe("extractScopes", () => {
  it("parses space-delimited scope strings", () => {
    expect(extractScopes({ scope: "openid profile aws:read" })).toEqual([
      "openid",
      "profile",
      "aws:read",
    ]);
  });

  it("parses scp arrays", () => {
    expect(extractScopes({ scp: ["openid", "aws:read"] })).toEqual(["openid", "aws:read"]);
  });

  it("parses Auth0 RBAC permissions arrays", () => {
    expect(extractScopes({ permissions: ["aws:read"] })).toEqual(["aws:read"]);
  });

  it("unions scope, scp, and permissions without duplicates", () => {
    expect(
      extractScopes({
        scope: "openid aws:read",
        scp: ["profile", "aws:read"],
        permissions: ["aws:read"],
      }),
    ).toEqual(["openid", "aws:read", "profile"]);
  });

  it("returns an empty array when scope claims are absent", () => {
    expect(extractScopes({})).toEqual([]);
  });
});

describe("hasRequiredScopes", () => {
  it("requires every configured scope", () => {
    expect(hasRequiredScopes(["aws:read", "openid"], ["aws:read"])).toBe(true);
    expect(hasRequiredScopes(["openid"], ["aws:read"])).toBe(false);
    expect(hasRequiredScopes(extractScopes({ permissions: ["openid"] }), ["aws:read"])).toBe(false);
  });
});
