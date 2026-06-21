import { describe, it, expect } from "vitest";
import { buildOAuthChallenge } from "./challenge.js";
import type { ValidatedOAuthConfig } from "./types.js";

const testConfig: ValidatedOAuthConfig = {
  MCP_RESOURCE_URL: "https://gateway.example.com",
  OAUTH_ISSUER: "https://auth.example.com/",
  OAUTH_AUDIENCE: "https://gateway.example.com",
  OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
  OAUTH_REQUIRED_SCOPES: ["aws:read"],
};

describe("buildOAuthChallenge", () => {
  it("includes resource_metadata and scope", () => {
    const challenge = buildOAuthChallenge(testConfig);

    expect(challenge).toBe(
      'Bearer resource_metadata="https://gateway.example.com/.well-known/oauth-protected-resource", scope="aws:read"',
    );
  });

  it("joins multiple required scopes", () => {
    const challenge = buildOAuthChallenge({
      ...testConfig,
      OAUTH_REQUIRED_SCOPES: ["aws:read", "openid"],
    });

    expect(challenge).toContain('scope="aws:read openid"');
  });

  it("includes error parameters when provided", () => {
    const challenge = buildOAuthChallenge(testConfig, {
      error: "invalid_token",
      errorDescription: "Authentication is required.",
    });

    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('error_description="Authentication is required."');
  });

  it("does not include sensitive material in challenge output", () => {
    const challenge = buildOAuthChallenge(testConfig, {
      error: "invalid_token",
      errorDescription: "Authentication is required.",
    });

    expect(challenge).toContain("Bearer");
    expect(challenge).toContain("resource_metadata=");
    expect(challenge).toContain("scope=");
    expect(challenge).not.toContain("AKIA");
    expect(challenge).not.toContain("client_secret");
    expect(challenge).not.toContain("BEGIN PUBLIC KEY");
    expect(challenge).not.toContain("eyJ");
    expect(challenge).not.toContain("refresh_token");
  });
});
