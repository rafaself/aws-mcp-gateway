import type { AwsCredentials } from "../aws/types.js";
import type { KVNamespace } from "@cloudflare/workers-types";
import { parseRegions } from "../security/regions.js";
import type { ValidatedGatewayConfig } from "./env.js";

export interface GatewayContext {
  credentials: AwsCredentials;
  region: string;
  allowedRegions: string[];
  cache?: KVNamespace;
  /** MCP resource URL for ChatGPT search/fetch citations (oauth production). */
  mcpResourceUrl?: string;
}

export function buildGatewayContext(config: ValidatedGatewayConfig): GatewayContext {
  return {
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    region: config.AWS_REGION,
    allowedRegions: parseRegions(config.AWS_ALLOWED_REGIONS),
    cache: config.AWS_MCP_CACHE,
    mcpResourceUrl: config.oauth?.MCP_RESOURCE_URL,
  };
}
