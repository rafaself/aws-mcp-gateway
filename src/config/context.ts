import type { GatewayContext } from "../mcp/context.js";
import { parseRegions } from "../security/regions.js";
import type { ValidatedGatewayConfig } from "./env.js";

export function buildGatewayContext(config: ValidatedGatewayConfig): GatewayContext {
  return {
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    region: config.AWS_REGION,
    allowedRegions: parseRegions(config.AWS_ALLOWED_REGIONS),
    cache: config.AWS_MCP_CACHE,
  };
}
