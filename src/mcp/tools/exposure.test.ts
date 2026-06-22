import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import {
  buildToolRegistryState,
  createToolManifests,
  PUBLIC_TOOL_NAMES,
} from "./registry.js";
import { buildPublicToolList } from "./public-list.js";
import { resolveExposedToolNames } from "./packs.js";
import type { ToolPack } from "./manifest.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

beforeEach(() => {
  mockFetch.mockReset();
});

describe("tool exposure configuration", () => {
  it("default config exposes all current public tools", () => {
    const ctx = createTestGatewayContext();
    const manifests = createToolManifests(ctx);
    const exposed = resolveExposedToolNames(manifests, ctx.toolExposure);

    expect([...exposed].sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
  });

  it("enabling only cost exposes only cost tools", () => {
    const ctx = createTestGatewayContext({
      toolExposure: {
        enabledToolPacks: new Set<ToolPack>(["cost"]),
        enabledTools: [],
        disabledTools: new Set(),
        maxRiskLevel: "read-only",
      },
    });
    const manifests = createToolManifests(ctx);
    const exposed = resolveExposedToolNames(manifests, ctx.toolExposure);

    expect([...exposed].sort()).toEqual(
      ["get_aws_cost_by_service", "get_aws_cost_summary"].sort(),
    );
  });

  it("removes disabled tools from tools/list", async () => {
    const ctx = createTestGatewayContext({
      toolExposure: {
        ...defaultResolvedToolExposure(),
        disabledTools: new Set(["list_ec2_instances"]),
      },
    });
    const { registry, policyContext } = buildToolRegistryState(ctx);
    const { tools } = buildPublicToolList(registry, policyContext.enabledToolNames);

    expect(tools.map((tool) => tool.name)).not.toContain("list_ec2_instances");
    expect(tools).toHaveLength(PUBLIC_TOOL_NAMES.length - 1);
  });

  it("denies direct calls to disabled tools before AWS execution", async () => {
    const ctx = createTestGatewayContext({
      toolExposure: {
        ...defaultResolvedToolExposure(),
        disabledTools: new Set(["list_ec2_instances"]),
      },
    });
    const { registry } = buildToolRegistryState(ctx);
    const tool = registry.find((candidate) => candidate.name === "list_ec2_instances")!;

    const result = (await tool.handler({ regions: ["us-east-1"] })) as {
      isError?: boolean;
      structuredContent?: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error.code).toBe("validation_error");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("explicit enabled tool list restricts exposure within enabled packs", () => {
    const ctx = createTestGatewayContext({
      toolExposure: {
        enabledToolPacks: new Set<ToolPack>(["core", "cost"]),
        enabledTools: ["search", "get_aws_cost_summary"],
        disabledTools: new Set(),
        maxRiskLevel: "read-only",
      },
    });
    const exposed = resolveExposedToolNames(createToolManifests(ctx), ctx.toolExposure);

    expect([...exposed].sort()).toEqual(["get_aws_cost_summary", "search"].sort());
  });
});
