import { describe, expect, it } from "vitest";
import {
  validateOAuthAudienceUrl,
  validateOAuthIntrospectionUrl,
  validateOAuthIssuerUrl,
  validateOAuthJwksUri,
  validateOAuthResourceUrl,
  validateHttpsUrl,
} from "./oauth-urls.js";

describe("oauth URL validation", () => {
  it("requires https URLs", () => {
    const errors: string[] = [];
    expect(validateHttpsUrl("http://gateway.example.com", "MCP_RESOURCE_URL", errors)).toBeNull();
    expect(errors).toContain("MCP_RESOURCE_URL (must be an https URL)");
  });

  it("validates resource and audience origins without paths", () => {
    const errors: string[] = [];
    expect(validateOAuthResourceUrl("https://gateway.example.com/mcp", errors)).toBeNull();
    expect(errors).toContain("MCP_RESOURCE_URL (must not include a path)");

    errors.length = 0;
    expect(validateOAuthResourceUrl("https://gateway.example.com", errors)).toBe(
      "https://gateway.example.com",
    );
    expect(validateOAuthAudienceUrl("https://gateway.example.com", errors)).toBe(
      "https://gateway.example.com",
    );
  });

  it("rejects query strings and fragments on resource URLs", () => {
    const errors: string[] = [];
    expect(validateOAuthResourceUrl("https://example.workers.dev?x=1", errors)).toBeNull();
    expect(errors).toContain("MCP_RESOURCE_URL (must not include query or fragment)");

    errors.length = 0;
    expect(validateOAuthResourceUrl("https://example.workers.dev#x", errors)).toBeNull();
    expect(errors).toContain("MCP_RESOURCE_URL (must not include query or fragment)");
  });

  it("normalizes issuer trailing slash", () => {
    const errors: string[] = [];
    expect(validateOAuthIssuerUrl("https://auth.example.com", errors)).toBe(
      "https://auth.example.com/",
    );
  });

  it("requires JWKS URI path", () => {
    const errors: string[] = [];
    expect(validateOAuthJwksUri("https://auth.example.com/jwks", errors)).toBeNull();
    expect(errors).toContain("OAUTH_JWKS_URI (must end with /.well-known/jwks.json)");
    expect(
      validateOAuthJwksUri("https://auth.example.com/.well-known/jwks.json", errors),
    ).toBe("https://auth.example.com/.well-known/jwks.json");
  });

  it("accepts https introspection URLs", () => {
    const errors: string[] = [];
    expect(
      validateOAuthIntrospectionUrl("https://auth.example.com/oauth/introspect", errors),
    ).toBe("https://auth.example.com/oauth/introspect");
  });
});
