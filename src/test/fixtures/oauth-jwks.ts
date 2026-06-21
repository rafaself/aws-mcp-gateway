import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import type { ValidatedOAuthConfig } from "../../auth/oauth/types.js";

export const TEST_OAUTH_ISSUER = "https://auth.example.com/";
export const TEST_OAUTH_AUDIENCE = "https://gateway.example.com";
export const TEST_OAUTH_JWKS_URI = "https://auth.example.com/.well-known/jwks.json";

export interface TestOAuthFixture {
  config: ValidatedOAuthConfig;
  jwksResolver: ReturnType<typeof createLocalJWKSet>;
  signAccessToken: (
    claims?: Record<string, unknown>,
    options?: { expiresIn?: string; issuer?: string; audience?: string },
  ) => Promise<string>;
}

export async function createTestOAuthFixture(): Promise<TestOAuthFixture> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "ES256";
  const jwksResolver = createLocalJWKSet({ keys: [jwk] });

  const config: ValidatedOAuthConfig = {
    MCP_RESOURCE_URL: TEST_OAUTH_AUDIENCE,
    OAUTH_ISSUER: TEST_OAUTH_ISSUER,
    OAUTH_AUDIENCE: TEST_OAUTH_AUDIENCE,
    OAUTH_JWKS_URI: TEST_OAUTH_JWKS_URI,
    OAUTH_REQUIRED_SCOPES: ["aws:read"],
    OAUTH_TOKEN_VALIDATION_MODE: "jwks",
  };

  async function signAccessToken(
    claims: Record<string, unknown> = { scope: "aws:read" },
    options: { expiresIn?: string; issuer?: string; audience?: string } = {},
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer(options.issuer ?? TEST_OAUTH_ISSUER)
      .setAudience(options.audience ?? TEST_OAUTH_AUDIENCE)
      .setExpirationTime(options.expiresIn ?? "1h")
      .sign(privateKey);
  }

  return { config, jwksResolver, signAccessToken };
}
