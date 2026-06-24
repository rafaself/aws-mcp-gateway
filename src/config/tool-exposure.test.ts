import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import { createToolManifests } from "../mcp/tools/registry.js";
import { resolveExposedToolNames } from "../mcp/tools/packs.js";
import {
  DEFAULT_ENABLED_TOOL_PACKS,
  DEFAULT_ENABLED_TOOL_PACKS_CSV,
  DEFAULT_EXPOSED_CATALOG_COUNT,
  DEFAULT_EXPOSED_TOOL_COUNT,
  OPT_IN_TOOL_PACKS,
  TOOL_PACKS,
  defaultResolvedToolExposure,
} from "./tool-exposure.js";

const OPT_IN_SECURITY_TOOLS = [
  "check_ssm_parameter_inventory",
  "get_s3_bucket_posture",
  "get_ses_configuration_status",
  "get_sns_topic_status",
  "get_eventbridge_rules_status",
] as const;

const OPT_IN_AGGREGATE_TOOLS = [
  "aws_account_overview",
  "aws_cost_overview",
  "aws_observability_overview",
] as const;

const OPT_IN_APPLICATION_OPS_TOOLS = [
  "list_application_profiles",
  "get_application_environment_overview",
  "get_application_compute_status",
  "get_application_database_status",
  "get_application_logs",
  "get_application_secret_inventory",
  "get_application_artifact_status",
  "get_application_alerting_status",
  "get_application_cost_status",
] as const;

describe("tool exposure constants", () => {
  it("documents default packs as a CSV matching DEFAULT_ENABLED_TOOL_PACKS", () => {
    expect(DEFAULT_ENABLED_TOOL_PACKS_CSV).toBe(DEFAULT_ENABLED_TOOL_PACKS.join(","));
  });

  it("partitions all packs into default and opt-in sets", () => {
    const defaultSet = new Set<string>(DEFAULT_ENABLED_TOOL_PACKS);
    const optInSet = new Set<string>(OPT_IN_TOOL_PACKS);

    for (const pack of TOOL_PACKS) {
      expect(defaultSet.has(pack) !== optInSet.has(pack)).toBe(true);
    }

    expect(defaultSet.size + optInSet.size).toBe(TOOL_PACKS.length);
  });

  it("defaultResolvedToolExposure enables exactly default packs", () => {
    const exposure = defaultResolvedToolExposure();

    expect([...exposure.enabledToolPacks].sort()).toEqual([...DEFAULT_ENABLED_TOOL_PACKS].sort());
    expect(exposure.enabledTools).toEqual([]);
    expect(exposure.disabledTools.size).toBe(0);
    expect(exposure.maxRiskLevel).toBe("read-only");
  });

  it("default exposure exposes exactly DEFAULT_EXPOSED_TOOL_COUNT tools", () => {
    const ctx = createTestGatewayContext();
    const manifests = createToolManifests(ctx);
    const exposed = resolveExposedToolNames(manifests, ctx.toolExposure);

    expect(exposed.size).toBe(DEFAULT_EXPOSED_TOOL_COUNT);
    expect(DEFAULT_EXPOSED_CATALOG_COUNT).toBe(DEFAULT_EXPOSED_TOOL_COUNT - 2);
  });

  it("excludes all opt-in pack tools from default exposure", () => {
    const ctx = createTestGatewayContext();
    const exposed = resolveExposedToolNames(createToolManifests(ctx), ctx.toolExposure);

    for (const toolName of [
      ...OPT_IN_SECURITY_TOOLS,
      ...OPT_IN_AGGREGATE_TOOLS,
      ...OPT_IN_APPLICATION_OPS_TOOLS,
    ]) {
      expect(exposed.has(toolName)).toBe(false);
    }
  });
});
