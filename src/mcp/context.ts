import type { AwsCredentials } from "../aws/types.js";
import type { KVNamespace } from "@cloudflare/workers-types";

export interface GatewayContext {
  credentials: AwsCredentials;
  region: string;
  allowedRegions: string[];
  cache?: KVNamespace;
}
