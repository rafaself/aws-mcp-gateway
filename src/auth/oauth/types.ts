export interface ValidatedOAuthConfig {
  MCP_RESOURCE_URL: string;
  OAUTH_ISSUER: string;
  OAUTH_AUDIENCE: string;
  OAUTH_JWKS_URI: string;
  OAUTH_REQUIRED_SCOPES: string[];
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  resource_documentation: string;
}

export interface OAuthConfigValidationSuccess {
  valid: true;
  config: ValidatedOAuthConfig;
  errors: [];
}

export interface OAuthConfigValidationFailure {
  valid: false;
  config: null;
  errors: string[];
}

export type OAuthConfigValidationResult =
  | OAuthConfigValidationSuccess
  | OAuthConfigValidationFailure;
