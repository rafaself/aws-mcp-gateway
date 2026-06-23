import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import {
  APPLICATION_OPS_TOOL_SECTIONS,
  applicationOpsCapabilitiesForSections,
} from "./definitions/application-ops-shared.js";
import { isAwsBackedManifest } from "./policy.js";
import { createToolManifests } from "./registry.js";

const APPLICATION_OPS_AWS_TOOLS = Object.keys(APPLICATION_OPS_TOOL_SECTIONS);

const SCHEDULER_CAPABILITIES = ["scheduler:ListSchedules", "scheduler:GetSchedule"] as const;

describe("application-ops manifest contract", () => {
  const manifests = createToolManifests(createTestGatewayContext());
  const byName = Object.fromEntries(manifests.map((manifest) => [manifest.name, manifest]));

  for (const toolName of APPLICATION_OPS_AWS_TOOLS) {
    it(`${toolName} declares capabilities for every composed section plus profile auth`, () => {
      const manifest = byName[toolName];
      expect(isAwsBackedManifest(manifest)).toBe(true);

      const sections = APPLICATION_OPS_TOOL_SECTIONS[toolName as keyof typeof APPLICATION_OPS_TOOL_SECTIONS];
      const expectedCapabilities = applicationOpsCapabilitiesForSections(sections);

      expect([...manifest.aws.capabilities].sort()).toEqual(expectedCapabilities);
    });
  }

  it("does not over-declare cloudwatch:GetMetricData on application-ops tools", () => {
    for (const toolName of APPLICATION_OPS_AWS_TOOLS) {
      const manifest = byName[toolName];
      expect(manifest.aws.capabilities).not.toContain("cloudwatch:GetMetricData");
    }
  });

  it("declares scheduler capabilities where EventBridge status is collected", () => {
    for (const toolName of [
      "get_application_alerting_status",
      "get_application_environment_overview",
    ] as const) {
      const manifest = byName[toolName];
      for (const capability of SCHEDULER_CAPABILITIES) {
        expect(manifest.aws.capabilities).toContain(capability);
      }
    }
  });

  it("declares sts:AssumeRole for profile-backed application-ops tools", () => {
    for (const toolName of APPLICATION_OPS_AWS_TOOLS) {
      const manifest = byName[toolName];
      expect(manifest.aws.capabilities).toContain("sts:AssumeRole");
    }
  });
});
