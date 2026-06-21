import type { ProtectedResourceMetadata, ValidatedOAuthConfig } from "./types.js";

const RESOURCE_DOCUMENTATION = "https://github.com/rafaself/aws-mcp-gateway";

export function buildProtectedResourceMetadata(
  config: ValidatedOAuthConfig,
): ProtectedResourceMetadata {
  return {
    resource: config.MCP_RESOURCE_URL,
    authorization_servers: [config.OAUTH_ISSUER],
    scopes_supported: [...config.OAUTH_REQUIRED_SCOPES],
    resource_documentation: RESOURCE_DOCUMENTATION,
  };
}

export function protectedResourceMetadataUrl(config: ValidatedOAuthConfig): string {
  const base = config.MCP_RESOURCE_URL.replace(/\/$/, "");
  return `${base}/.well-known/oauth-protected-resource`;
}
