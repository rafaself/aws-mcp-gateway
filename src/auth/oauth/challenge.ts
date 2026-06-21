import { protectedResourceMetadataUrl } from "./metadata.js";
import type { ValidatedOAuthConfig } from "./types.js";

export type OAuthChallengeOptions = {
  error?: string;
  errorDescription?: string;
};

export function buildOAuthChallenge(
  config: ValidatedOAuthConfig,
  options: OAuthChallengeOptions = {},
): string {
  const resourceMetadata = protectedResourceMetadataUrl(config);
  const scope = config.OAUTH_REQUIRED_SCOPES.join(" ");
  const parts = [`resource_metadata="${resourceMetadata}"`, `scope="${scope}"`];

  if (options.error) {
    parts.push(`error="${options.error}"`);
  }
  if (options.errorDescription) {
    parts.push(`error_description="${options.errorDescription}"`);
  }

  return `Bearer ${parts.join(", ")}`;
}
