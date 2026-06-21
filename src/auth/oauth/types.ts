export type OAuthTokenValidationMode = "jwks" | "introspection" | "hybrid";

export interface ValidatedOAuthIntrospectionConfig {
  url: string;
  clientId: string;
  clientSecret: string;
}

export interface ValidatedOAuthConfig {
  MCP_RESOURCE_URL: string;
  OAUTH_ISSUER: string;
  OAUTH_AUDIENCE: string;
  OAUTH_JWKS_URI?: string;
  OAUTH_REQUIRED_SCOPES: string[];
  OAUTH_TOKEN_VALIDATION_MODE: OAuthTokenValidationMode;
  OAUTH_INTROSPECTION?: ValidatedOAuthIntrospectionConfig;
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
