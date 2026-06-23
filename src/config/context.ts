import type { AwsCredentials } from "../aws/types.js";
import type { AwsCredentialResolver } from "../aws/credentials/resolver.js";
import { createCredentialResolver } from "../aws/credentials/resolver.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import type { ExecutionCollector } from "../telemetry/collector.js";
import { createExecutionCollector } from "../telemetry/collector.js";
import { parseRegions } from "../security/regions.js";
import type { AuthMode, ValidatedGatewayConfig } from "./env.js";
import {
  defaultResolvedToolExposure,
  type ValidatedToolExposureConfig,
} from "./tool-exposure.js";

export type { ValidatedToolExposureConfig };

export interface GatewayContext {
  credentials: AwsCredentials;
  credentialResolver: AwsCredentialResolver;
  region: string;
  allowedRegions: string[];
  cache?: KVNamespace;
  appConfig?: KVNamespace;
  appProfileIndexKey: string;
  execution: ExecutionCollector;
  /** MCP resource URL for ChatGPT search/fetch citations (oauth production). */
  mcpResourceUrl?: string;
  authMode?: AuthMode;
  oauthRequiredScopes?: string[];
  /** OAuth token scopes or local-bearer default scopes granted for this request. */
  grantedScopes?: readonly string[];
  toolExposure: ValidatedToolExposureConfig;
}

export type BuildGatewayContextOptions = {
  grantedScopes?: readonly string[];
};

export function defaultGatewayToolExposure(): ValidatedToolExposureConfig {
  return defaultResolvedToolExposure();
}

export function buildGatewayContext(
  config: ValidatedGatewayConfig,
  options?: BuildGatewayContextOptions,
): GatewayContext {
  const credentials: AwsCredentials = {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  };

  return {
    credentials,
    credentialResolver: createCredentialResolver({
      defaultCredentials: credentials,
      region: config.AWS_REGION,
    }),
    region: config.AWS_REGION,
    allowedRegions: parseRegions(config.AWS_ALLOWED_REGIONS),
    cache: config.AWS_MCP_CACHE,
    appConfig: config.AWS_MCP_APP_CONFIG,
    appProfileIndexKey: config.AWS_MCP_APP_PROFILE_INDEX_KEY,
    execution: createExecutionCollector(),
    mcpResourceUrl: config.oauth?.MCP_RESOURCE_URL,
    authMode: config.authMode,
    oauthRequiredScopes: config.oauth?.OAUTH_REQUIRED_SCOPES,
    grantedScopes: options?.grantedScopes,
    toolExposure: config.toolExposure,
  };
}
