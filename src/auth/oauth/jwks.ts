import type { createLocalJWKSet } from "jose";

type JwksResolver = ReturnType<typeof createLocalJWKSet>;

let cachedJwks: {
  uri: string;
  resolver: JwksResolver;
  fetchedAt: number;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

export function resetJwksCache(): void {
  cachedJwks = null;
}

export function setJwksResolverForTesting(uri: string, resolver: JwksResolver): void {
  cachedJwks = { uri, resolver, fetchedAt: Date.now() };
}

export async function getJwksResolver(jwksUri: string): Promise<JwksResolver> {
  if (
    cachedJwks &&
    cachedJwks.uri === jwksUri &&
    Date.now() - cachedJwks.fetchedAt < CACHE_TTL_MS
  ) {
    return cachedJwks.resolver;
  }

  const { createRemoteJWKSet } = await import("jose");
  const resolver = createRemoteJWKSet(new URL(jwksUri));
  cachedJwks = { uri: jwksUri, resolver, fetchedAt: Date.now() };
  return resolver;
}
