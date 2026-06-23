import { assumeRole } from "../sts/assume-role.js";
import type { AwsCredentials } from "../types.js";
import { buildCredentialCacheKey, isValidRoleArn, withDefaultSource } from "./helpers.js";
import type { CredentialRequest } from "./types.js";

export const CREDENTIAL_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type CredentialResolverOptions = {
  defaultCredentials: AwsCredentials;
  region: string;
  now?: () => number;
};

type CachedCredentialEntry = {
  credentials: AwsCredentials;
};

export type AwsCredentialResolver = {
  resolve(request: CredentialRequest): Promise<AwsCredentials>;
};

export function createCredentialResolver(
  options: CredentialResolverOptions,
): AwsCredentialResolver {
  const cache = new Map<string, CachedCredentialEntry>();
  const now = options.now ?? (() => Date.now());

  return {
    async resolve(request: CredentialRequest): Promise<AwsCredentials> {
      if (request.strategy === "default") {
        return withDefaultSource(options.defaultCredentials);
      }

      const { roleArn, externalId, sessionName } = request;

      if (!isValidRoleArn(roleArn)) {
        throw new Error("Invalid role ARN.");
      }

      const cacheKey = await buildCredentialCacheKey(roleArn, externalId);
      const cached = cache.get(cacheKey);
      if (cached && !isNearExpiry(cached.credentials, now())) {
        return cached.credentials;
      }

      const credentials = await assumeRole(
        {
          roleArn,
          region: options.region,
          externalId,
          sessionName,
        },
        options.defaultCredentials,
      );

      cache.set(cacheKey, { credentials });
      return credentials;
    },
  };
}

function isNearExpiry(credentials: AwsCredentials, currentTime: number): boolean {
  if (!credentials.expiresAt) {
    return true;
  }

  return credentials.expiresAt - currentTime <= CREDENTIAL_REFRESH_MARGIN_MS;
}
