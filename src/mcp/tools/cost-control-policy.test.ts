import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { COST_MAX_DATE_RANGE_DAYS, COST_MAX_SERVICE_ROWS } from "../../security/limits.js";
import { sanitizeNoInput } from "../audit/tool-input.js";
import type { AnyToolManifest } from "./manifest.js";
import {
  validateCostControlManifest,
  validateCostControlRequest,
} from "./cost-control-policy.js";
import { buildToolPolicyContext } from "./policy.js";
import { createToolManifests } from "./registry.js";

const testContext = createTestGatewayContext({ authMode: "local-bearer" });
const manifests = createToolManifests(testContext);
const defaultPolicy = buildToolPolicyContext(testContext, manifests);

function baseManifest(overrides: Partial<AnyToolManifest> = {}): AnyToolManifest {
  const template = manifests.find((candidate) => candidate.name === "get_aws_cost_summary")!;
  return {
    ...template,
    ...overrides,
    aws: { ...template.aws, ...overrides.aws },
    safety: { ...template.safety, ...overrides.safety },
    costControl: { ...template.costControl, ...overrides.costControl },
  };
}

describe("cost-control policy", () => {
  describe("validateCostControlManifest", () => {
    it("accepts every public manifest", () => {
      for (const manifest of manifests) {
        expect(validateCostControlManifest(manifest)).toBeNull();
      }
    });

    it("rejects AWS-backed tools without cost-control metadata", () => {
      const manifest = baseManifest();
      delete (manifest as { costControl?: unknown }).costControl;
      expect(validateCostControlManifest(manifest)?.message).toBe(
        "Tool is missing required cost-control metadata.",
      );
    });

    it("rejects paid tools without cache metadata", () => {
      const manifest = baseManifest({
        costControl: {
          class: "paid",
          requiresCache: false,
          timeoutMs: 15000,
          maxDateRangeDays: COST_MAX_DATE_RANGE_DAYS,
        },
      });

      expect(validateCostControlManifest(manifest)?.message).toBe(
        "Tool cost-control metadata is invalid.",
      );
    });

    it("rejects non-AWS tools that are not free", () => {
      const manifest = manifests.find((candidate) => candidate.name === "search")!;
      const invalid: AnyToolManifest = {
        ...manifest,
        costControl: {
          class: "paid",
          requiresCache: true,
          timeoutMs: 5000,
          minCacheTtlSeconds: 1,
        },
      };

      expect(validateCostControlManifest(invalid)?.message).toBe(
        "Tool cost-control metadata is invalid.",
      );
    });

    it("rejects mismatched timeout metadata", () => {
      const manifest = baseManifest({
        safety: {
          ...baseManifest().safety,
          timeoutMs: 15000,
        },
        costControl: {
          ...baseManifest().costControl,
          timeoutMs: 10000,
        },
      });

      expect(validateCostControlManifest(manifest)?.message).toBe(
        "Tool cost-control metadata is invalid.",
      );
    });
  });

  describe("validateCostControlRequest", () => {
    it("rejects date ranges beyond manifest metadata", () => {
      const manifest = manifests.find((candidate) => candidate.name === "get_aws_cost_summary")!;

      const denial = validateCostControlRequest(
        manifest,
        defaultPolicy,
        {
          startDate: "2024-01-01",
          endDate: "2024-06-01",
        },
      );

      expect(denial?.code).toBe("validation_error");
      expect(denial?.message).toBe("Date range is not allowed for this tool.");
      expect(denial?.message).not.toMatch(/90/);
    });

    it("rejects result counts beyond manifest metadata", () => {
      const manifest = manifests.find((candidate) => candidate.name === "get_aws_cost_by_service")!;

      const denial = validateCostControlRequest(manifest, defaultPolicy, {
        limit: COST_MAX_SERVICE_ROWS + 1,
      });

      expect(denial?.message).toBe("Result count is not allowed for this tool.");
    });

    it("rejects region fanout beyond allowed regions", () => {
      const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
      const constrained: AnyToolManifest = {
        ...manifest,
        costControl: {
          ...manifest.costControl,
          maxRegions: 1,
        },
      };
      const policy = buildToolPolicyContext(testContext, manifests);

      const denial = validateCostControlRequest(constrained, policy, {
        regions: ["us-east-1", "us-west-2"],
      });

      expect(denial?.message).toBe("Region fanout is not allowed for this tool.");
    });

    it("rejects lookback hours beyond manifest metadata", () => {
      const manifest = manifests.find((candidate) => candidate.name === "get_recent_log_errors")!;

      const denial = validateCostControlRequest(manifest, defaultPolicy, {
        hours: 25,
      });

      expect(denial?.message).toBe("Lookback window is not allowed for this tool.");
    });
  });
});

describe("cost-control malformed manifest fixture", () => {
  it("rejects manifests missing cost-control in policy evaluation", () => {
    const malformed = {
      name: "broken_tool",
      title: "Broken",
      description: "Broken tool",
      pack: "core",
      lifecycle: "stable",
      visibility: { mcp: true, chatgpt: false },
      auth: { requiredScopes: ["aws:read"] },
      aws: {
        services: ["ec2"],
        actions: ["ec2:DescribeInstances"],
        capabilities: ["ec2:DescribeInstances"],
        regionMode: "single-region",
        readonly: true,
      },
      safety: {
        riskLevel: "read-only",
        cacheTtlSeconds: 300,
        timeoutMs: 15000,
        costClass: "cached-read",
      },
      audit: { sanitizeInput: sanitizeNoInput },
      descriptorKind: "aws-readonly",
      handler: async () => ({
        content: [{ type: "text" as const, text: "{}" }],
      }),
    } as unknown as AnyToolManifest;

    expect(validateCostControlManifest(malformed)?.message).toBe(
      "Tool is missing required cost-control metadata.",
    );
  });
});
