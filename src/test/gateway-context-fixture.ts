import type { GatewayContext } from "../config/context.js";
import { defaultGatewayToolExposure } from "../config/context.js";

const DEFAULT_TEST_CREDENTIALS = {
  accessKeyId: "AKIA-test",
  secretAccessKey: "test-secret",
} as const;

export function createTestGatewayContext(
  overrides: Partial<GatewayContext> = {},
): GatewayContext {
  return {
    credentials: DEFAULT_TEST_CREDENTIALS,
    region: "us-east-1",
    allowedRegions: ["us-east-1", "us-west-2"],
    toolExposure: defaultGatewayToolExposure(),
    ...overrides,
  };
}
