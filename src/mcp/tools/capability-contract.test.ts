import { describe, expect, it } from "vitest";
import {
  AWS_CAPABILITY_IDS,
  AWS_CAPABILITY_REGISTRY,
  isAwsCapabilityId,
  isReadOnlyIamAction,
} from "../../aws/capabilities.js";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import {
  buildAwsCapabilityMatrixRows,
  manifestCapabilitiesAreConsistent,
  renderAwsCapabilityMatrixMarkdown,
} from "./capability-matrix.js";
import { isAwsBackedManifest } from "./policy.js";
import { createToolManifests } from "./registry.js";

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
  "list_lambda_functions",
  "list_s3_buckets",
  "list_log_groups",
] as const;

const NON_AWS_TOOLS = ["search", "fetch", "get_gateway_status"] as const;

describe("aws capability contract", () => {
  const manifests = createToolManifests(createTestGatewayContext());
  const byName = Object.fromEntries(manifests.map((manifest) => [manifest.name, manifest]));

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} declares known AWS capabilities`, () => {
      const manifest = byName[toolName];
      expect(isAwsBackedManifest(manifest)).toBe(true);
      expect(manifest.aws.capabilities.length).toBeGreaterThan(0);
      for (const capabilityId of manifest.aws.capabilities) {
        expect(isAwsCapabilityId(capabilityId)).toBe(true);
      }
    });
  }

  for (const toolName of NON_AWS_TOOLS) {
    it(`${toolName} does not require AWS capabilities`, () => {
      const manifest = byName[toolName];
      expect(isAwsBackedManifest(manifest)).toBe(false);
      expect(manifest.aws.capabilities).toEqual([]);
    });
  }

  it("keeps manifest AWS metadata aligned with declared capabilities", () => {
    for (const manifest of manifests) {
      expect(manifestCapabilitiesAreConsistent(manifest)).toBe(true);
    }
  });

  it("maps every capability to a read-only IAM action", () => {
    for (const id of AWS_CAPABILITY_IDS) {
      const capability = AWS_CAPABILITY_REGISTRY[id];
      expect(isReadOnlyIamAction(capability.iamAction)).toBe(true);
    }
  });

  it("includes every AWS-backed tool in the capability matrix", () => {
    const rows = buildAwsCapabilityMatrixRows(manifests);
    const toolNames = new Set(rows.map((row) => row.toolName));

    for (const toolName of AWS_BACKED_TOOLS) {
      expect(toolNames.has(toolName)).toBe(true);
    }
  });

  it("does not require write permissions for current public tools", () => {
    for (const manifest of manifests) {
      for (const action of manifest.aws.actions) {
        expect(isReadOnlyIamAction(action)).toBe(true);
      }
    }
  });

  it("does not include deployment-specific values in capability metadata", () => {
    const rendered = renderAwsCapabilityMatrixMarkdown(manifests);
    const serialized = JSON.stringify(AWS_CAPABILITY_REGISTRY) + rendered;

    expect(serialized).not.toMatch(/AKIA/);
    expect(serialized).not.toMatch(/arn:aws/);
    expect(serialized).not.toMatch(/\d{12}/);
  });
});
