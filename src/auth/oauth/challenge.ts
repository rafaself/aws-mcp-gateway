import { protectedResourceMetadataUrl } from "./metadata.js";
import type { ValidatedOAuthConfig } from "./types.js";

export function buildOAuthChallenge(config: ValidatedOAuthConfig): string {
  const resourceMetadata = protectedResourceMetadataUrl(config);
  const scope = config.OAUTH_REQUIRED_SCOPES.join(" ");
  return `Bearer resource_metadata="${resourceMetadata}", scope="${scope}"`;
}
