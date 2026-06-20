import type { GatewayContext } from "../mcp/context.js";
import { parseRegions } from "../security/regions.js";
import type { KVNamespace } from "@cloudflare/workers-types";

export function buildGatewayContext(env: unknown): GatewayContext {
  const bindings = env as Record<string, unknown>;
  return {
    credentials: {
      accessKeyId: (bindings.AWS_ACCESS_KEY_ID as string) ?? "",
      secretAccessKey: (bindings.AWS_SECRET_ACCESS_KEY as string) ?? "",
    },
    region: (bindings.AWS_REGION as string) ?? "us-east-1",
    allowedRegions: parseRegions(
      (bindings.AWS_ALLOWED_REGIONS as string) ?? "us-east-1",
    ),
    cache: bindings.AWS_MCP_CACHE as KVNamespace | undefined,
  };
}
