import { describe, it, expect } from "vitest";
import { buildProtectedResourceMetadata, protectedResourceMetadataUrl } from "./metadata.js";
import type { ValidatedOAuthConfig } from "./types.js";

const testConfig: ValidatedOAuthConfig = {
  MCP_RESOURCE_URL: "https://gateway.example.com",
  OAUTH_ISSUER: "https://auth.example.com/",
  OAUTH_AUDIENCE: "https://gateway.example.com",
  OAUTH_JWKS_URI: "https://auth.example.com/.well-known/jwks.json",
  OAUTH_REQUIRED_SCOPES: ["aws:read"],
  OAUTH_TOKEN_VALIDATION_MODE: "jwks",
};

describe("buildProtectedResourceMetadata", () => {
  it("returns expected public fields", () => {
    const metadata = buildProtectedResourceMetadata(testConfig);

    expect(metadata).toEqual({
      resource: "https://gateway.example.com",
      authorization_servers: ["https://auth.example.com/"],
      scopes_supported: ["aws:read"],
      resource_documentation: "https://github.com/rafaself/aws-mcp-gateway",
    });
  });

  it("does not include secret values", () => {
    const metadata = buildProtectedResourceMetadata(testConfig);
    const serialized = JSON.stringify(metadata);

    expect(serialized).not.toContain("jwks");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("AKIA");
  });
});

describe("protectedResourceMetadataUrl", () => {
  it("builds the metadata document URL from MCP_RESOURCE_URL", () => {
    expect(protectedResourceMetadataUrl(testConfig)).toBe(
      "https://gateway.example.com/.well-known/oauth-protected-resource",
    );
  });
});
