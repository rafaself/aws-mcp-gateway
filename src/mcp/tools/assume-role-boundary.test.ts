import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { createToolManifests } from "./registry.js";

const DIRECT_TOOLS_WITHOUT_ROLE_INPUT = [
  "get_ses_configuration_status",
  "get_sns_topic_status",
  "get_eventbridge_rules_status",
  "get_budget_status",
] as const;

describe("AssumeRole public input boundary", () => {
  const manifests = createToolManifests(createTestGatewayContext());
  const manifestsByName = new Map(manifests.map((manifest) => [manifest.name, manifest]));

  it("direct generic tools do not accept roleArn or externalId in input schema", () => {
    for (const toolName of DIRECT_TOOLS_WITHOUT_ROLE_INPUT) {
      const manifest = manifestsByName.get(toolName);
      expect(manifest, `missing manifest for ${toolName}`).toBeDefined();

      const schema = manifest!.inputSchema;
      expect(schema).toBeInstanceOf(z.ZodObject);

      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      expect(shape.roleArn).toBeUndefined();
      expect(shape.externalId).toBeUndefined();
    }
  });

  it("does not expose resolveToolCredentials for public tool input", () => {
    const toolsDir = dirname(fileURLToPath(import.meta.url));
    expect(existsSync(join(toolsDir, "resolve-tool-credentials.ts"))).toBe(false);
    expect(existsSync(join(toolsDir, "schemas", "assume-role.ts"))).toBe(false);
  });
});
