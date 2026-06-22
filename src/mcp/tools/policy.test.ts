import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { sanitizeNoInput } from "../audit/tool-input.js";
import {
  manifestToGatewayDefinition,
  type AnyToolManifest,
} from "./manifest.js";
import {
  buildToolPolicyContext,
  evaluateToolPolicy,
  isAwsBackedManifest,
} from "./policy.js";
import { createToolManifests, PUBLIC_TOOL_NAMES } from "./registry.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    accessKeyId: string;
    secretAccessKey: string;
    service: string | undefined;
    region: string | undefined;
    fetch = mockFetch;

    constructor(opts: {
      accessKeyId: string;
      secretAccessKey: string;
      service?: string;
      region?: string;
    }) {
      this.accessKeyId = opts.accessKeyId;
      this.secretAccessKey = opts.secretAccessKey;
      this.service = opts.service;
      this.region = opts.region;
    }
  },
}));

const testContext = createTestGatewayContext({ authMode: "local-bearer" });

beforeEach(() => {
  mockFetch.mockReset();
  vi.restoreAllMocks();
});

describe("tool policy gate", () => {
  const manifests = createToolManifests(testContext);
  const defaultPolicy = buildToolPolicyContext(testContext, manifests);

  it("allows every existing public tool under the default policy", () => {
    for (const manifest of manifests) {
      expect(evaluateToolPolicy(manifest, defaultPolicy, {})).toBeNull();
    }
  });

  it("denies disabled tools before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "get_gateway_status")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      handler: handlerSpy,
    };
    const policy = buildToolPolicyContext(testContext, manifests, {
      enabledToolNames: new Set(
        manifests.map((candidate) => candidate.name).filter((name) => name !== manifest.name),
      ),
    });

    const tool = manifestToGatewayDefinition(manifestWithSpy, policy);
    const result = (await tool.handler({})) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
  });

  it("denies disabled packs before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "get_cloudwatch_alarms")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      handler: handlerSpy,
    };
    const policy = buildToolPolicyContext(testContext, manifests, {
      enabledPacks: new Set(["core", "cost", "inventory"]),
    });

    const tool = manifestToGatewayDefinition(manifestWithSpy, policy);
    const result = (await tool.handler({})) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
  });

  it("denies non-read-only risk levels", () => {
    const manifest = manifests.find((candidate) => candidate.name === "search")!;
    const elevatedRisk: AnyToolManifest = {
      ...manifest,
      safety: {
        ...manifest.safety,
        riskLevel: "write" as never,
      },
    };

    const denial = evaluateToolPolicy(elevatedRisk, defaultPolicy, {});

    expect(denial?.code).toBe("validation_error");
    expect(denial?.message).toBe("Tool risk level is not allowed.");
  });

  it("denies AWS-backed tools with missing AWS metadata", () => {
    const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
    const missingMetadata: AnyToolManifest = {
      ...manifest,
      aws: {
        ...manifest.aws,
        services: [],
        actions: [],
      },
    };

    expect(isAwsBackedManifest(missingMetadata)).toBe(true);

    const denial = evaluateToolPolicy(missingMetadata, defaultPolicy, {});

    expect(denial?.code).toBe("validation_error");
    expect(denial?.message).toBe("Tool is missing required AWS metadata.");
  });

  it("returns normalized MCP errors for policy denials", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "search")!;
    const policy = buildToolPolicyContext(testContext, manifests, {
      enabledToolNames: new Set(
        manifests.map((candidate) => candidate.name).filter((name) => name !== manifest.name),
      ),
    });

    const tool = manifestToGatewayDefinition(manifest, policy);
    const result = (await tool.handler({ query: "ec2" })) as {
      isError: boolean;
      structuredContent: { error: { code: string; retryable: boolean } };
      content: Array<{ type: string; text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
    expect(result.content[0]?.text).not.toMatch(/AKIA|secret|token/i);
  });

  it("emits safe audit metadata for policy denials", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
    const policy = buildToolPolicyContext(testContext, manifests, {
      enabledToolNames: new Set(
        manifests.map((candidate) => candidate.name).filter((name) => name !== manifest.name),
      ),
    });

    const tool = manifestToGatewayDefinition(manifest, policy);
    await tool.handler({ regions: ["us-east-1"] });

    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();

    const event = JSON.parse(log.mock.calls[0][0] as string);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "list_ec2_instances",
      outcome: "failure",
      error: { code: "validation_error", retryable: false },
    });
    expect(event.input).toEqual({ regionCount: 1 });
    expect(JSON.stringify(event)).not.toMatch(/AKIA|secret|token/i);

    log.mockRestore();
    error.mockRestore();
  });

  it("does not call AWS when policy denies execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
    const policy = buildToolPolicyContext(testContext, manifests, {
      enabledToolNames: new Set(
        manifests.map((candidate) => candidate.name).filter((name) => name !== manifest.name),
      ),
    });

    const tool = manifestToGatewayDefinition(manifest, policy);
    await tool.handler({ regions: ["us-east-1"] });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies region requests outside the allowlist before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      handler: handlerSpy,
    };

    const tool = manifestToGatewayDefinition(manifestWithSpy, defaultPolicy);
    const result = (await tool.handler({ regions: ["eu-west-1"] })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies malformed manifests", () => {
    const malformed: AnyToolManifest = {
      name: "",
      title: "Broken",
      description: "Broken tool",
      pack: "core",
      lifecycle: "stable",
      visibility: { mcp: true, chatgpt: false },
      auth: { requiredScopes: ["aws:read"] },
      aws: {
        services: [],
        actions: [],
        capabilities: [],
        regionMode: "none",
        readonly: true,
      },
      safety: {
        riskLevel: "read-only",
        cacheTtlSeconds: 0,
        timeoutMs: 1000,
        costClass: "none",
      },
      costControl: {
        class: "free",
        requiresCache: false,
        timeoutMs: 1000,
      },
      audit: { sanitizeInput: sanitizeNoInput },
      descriptorKind: "local-status",
      handler: async () => ({
        content: [{ type: "text" as const, text: "{}" }],
      }),
    };

    expect(evaluateToolPolicy(malformed, defaultPolicy, {})).toMatchObject({
      code: "validation_error",
      message: "Tool manifest is malformed.",
    });
  });

  it("covers every public tool name in default enabled set", () => {
    for (const toolName of PUBLIC_TOOL_NAMES) {
      expect(defaultPolicy.enabledToolNames.has(toolName)).toBe(true);
    }
  });

  it("denies AWS-backed tools with missing cost-control metadata", () => {
    const manifest = manifests.find((candidate) => candidate.name === "get_aws_cost_summary")!;
    const missingCostControl: AnyToolManifest = {
      ...manifest,
      costControl: undefined as never,
    };

    const denial = evaluateToolPolicy(missingCostControl, defaultPolicy, {
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });

    expect(denial?.code).toBe("validation_error");
    expect(denial?.message).toBe("Tool is missing required cost-control metadata.");
  });

  it("denies cost date ranges beyond policy metadata before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "get_aws_cost_summary")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      handler: handlerSpy,
    };

    const tool = manifestToGatewayDefinition(manifestWithSpy, defaultPolicy);
    const result = (await tool.handler({
      startDate: "2024-01-01",
      endDate: "2024-06-01",
      granularity: "MONTHLY",
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string; message?: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies excessive result counts before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "get_aws_cost_by_service")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      handler: handlerSpy,
    };

    const tool = manifestToGatewayDefinition(manifestWithSpy, defaultPolicy);
    const result = (await tool.handler({
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      granularity: "MONTHLY",
      limit: 26,
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("denies excessive region fanout before handler execution", async () => {
    const manifest = manifests.find((candidate) => candidate.name === "list_ec2_instances")!;
    const handlerSpy = vi.fn();
    const manifestWithSpy: AnyToolManifest = {
      ...manifest,
      costControl: {
        ...manifest.costControl,
        maxRegions: 1,
      },
      handler: handlerSpy,
    };

    const tool = manifestToGatewayDefinition(manifestWithSpy, defaultPolicy);
    const result = (await tool.handler({
      regions: ["us-east-1", "us-west-2"],
    })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
