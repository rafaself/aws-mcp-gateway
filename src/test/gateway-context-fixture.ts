import type { GatewayContext } from "../config/context.js";
import { createCredentialResolver } from "../aws/credentials/resolver.js";
import { createExecutionCollector } from "../telemetry/collector.js";
import { defaultGatewayToolExposure } from "../config/context.js";
import { APP_PROFILE_DEFAULT_INDEX_KEY } from "../security/limits.js";

const DEFAULT_TEST_CREDENTIALS = {
  accessKeyId: "AKIA-test",
  secretAccessKey: "test-secret",
} as const;

export function createTestGatewayContext(
  overrides: Partial<GatewayContext> = {},
): GatewayContext {
  const base = {
    credentials: DEFAULT_TEST_CREDENTIALS,
    region: "us-east-1",
    allowedRegions: ["us-east-1", "us-west-2"],
    execution: createExecutionCollector(),
    toolExposure: defaultGatewayToolExposure(),
    appProfileIndexKey: APP_PROFILE_DEFAULT_INDEX_KEY,
    ...overrides,
  };

  return {
    ...base,
    credentialResolver:
      overrides.credentialResolver ??
      createCredentialResolver({
        defaultCredentials: base.credentials,
        region: base.region,
      }),
  };
}
