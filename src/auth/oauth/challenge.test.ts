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
});
