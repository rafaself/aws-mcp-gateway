import { describe, expect, it, vi } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { OAUTH_REQUIRED_SCOPE } from "./descriptor.js";
import { buildPublicToolList } from "./public-list.js";
import {
  createToolManifests,
  createToolRegistry,
  getChatGptCatalogEntries,
  PUBLIC_TOOL_NAMES,
  buildToolRegistryState,
} from "./registry.js";
import type { AnyToolManifest } from "./manifest.js";
import { isAwsBackedManifest } from "./policy.js";
import { buildAwsExecutionMetadataFromManifest } from "../execution/build.js";
import { toolExecutionMetadataSchema } from "../execution/metadata.js";
import { paidManifestHasModeledUnitCosts } from "../execution/pricing.js";
import { DEFAULT_ENABLED_TOOL_PACKS } from "../../config/tool-exposure.js";

import {
  COST_MAX_DATE_RANGE_DAYS,
  COST_MAX_SERVICE_ROWS,
  LOGS_MAX_EVENTS,
  LOGS_MAX_HOURS,
} from "../../security/limits.js";

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

const testContext = createTestGatewayContext({
  mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
});

const AWS_BACKED_TOOLS = [
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
  "list_lambda_functions",
  "list_s3_buckets",
  "list_log_groups",
  "aws_account_overview",
  "aws_cost_overview",
  "aws_observability_overview",
] as const;

const CORE_TOOLS = ["search", "fetch", "get_gateway_status"] as const;

const CHATGPT_DYNAMIC_CATALOG_TOOLS = ["search", "fetch"] as const;

const STRUCTURED_OUTPUT_TOOLS = [
  ...CHATGPT_DYNAMIC_CATALOG_TOOLS,
  "get_gateway_status",
  ...AWS_BACKED_TOOLS,
] as const;

const EXPECTED_PACKS: Record<string, string> = {
  search: "core",
  fetch: "core",
  get_gateway_status: "core",
  get_aws_cost_summary: "cost",
  get_aws_cost_by_service: "cost",
  list_ec2_instances: "inventory",
  get_cloudwatch_alarms: "observability",
  get_recent_log_errors: "observability",
  list_lambda_functions: "inventory",
  list_s3_buckets: "inventory",
  list_log_groups: "observability",
  aws_account_overview: "aggregates",
  aws_cost_overview: "aggregates",
  aws_observability_overview: "aggregates",
};

const EXPECTED_CATALOG_ANCHORS = [
  { toolName: "get_gateway_status", docsAnchor: "1-get_gateway_status" },
  { toolName: "get_aws_cost_summary", docsAnchor: "2-get_aws_cost_summary" },
  { toolName: "get_aws_cost_by_service", docsAnchor: "3-get_aws_cost_by_service" },
  { toolName: "list_ec2_instances", docsAnchor: "4-list_ec2_instances" },
  { toolName: "get_cloudwatch_alarms", docsAnchor: "5-get_cloudwatch_alarms" },
  { toolName: "get_recent_log_errors", docsAnchor: "6-get_recent_log_errors" },
  { toolName: "list_lambda_functions", docsAnchor: "7-list_lambda_functions" },
  { toolName: "list_s3_buckets", docsAnchor: "8-list_s3_buckets" },
  { toolName: "list_log_groups", docsAnchor: "9-list_log_groups" },
  { toolName: "aws_account_overview", docsAnchor: "10-aws_account_overview" },
  { toolName: "aws_cost_overview", docsAnchor: "11-aws_cost_overview" },
  { toolName: "aws_observability_overview", docsAnchor: "12-aws_observability_overview" },
] as const;

const DEFAULT_EXPOSED_CATALOG_ANCHORS = EXPECTED_CATALOG_ANCHORS.filter(
  ({ toolName }) => EXPECTED_PACKS[toolName] !== "aggregates",
);

function defaultExposedToolNames(manifests: AnyToolManifest[]): string[] {
  const enabledPacks = new Set(DEFAULT_ENABLED_TOOL_PACKS);
  return manifests
    .filter((manifest) => enabledPacks.has(manifest.pack))
    .map((manifest) => manifest.name)
    .sort();
}

function manifestsByName(manifests: AnyToolManifest[]): Record<string, AnyToolManifest> {
  return Object.fromEntries(manifests.map((manifest) => [manifest.name, manifest]));
}

describe("tool manifest contract", () => {
  const manifests = createToolManifests(testContext);
  const byName = manifestsByName(manifests);

  it("defines exactly one manifest per public tool", () => {
    expect(manifests.map((manifest) => manifest.name).sort()).toEqual(
      [...PUBLIC_TOOL_NAMES].sort(),
    );
    expect(manifests).toHaveLength(PUBLIC_TOOL_NAMES.length);
  });

  for (const toolName of PUBLIC_TOOL_NAMES) {
    it(`${toolName} manifest includes required metadata`, () => {
      const manifest = byName[toolName];

      expect(manifest.name).toBe(toolName);
      expect(manifest.name.length).toBeGreaterThan(0);
      expect(manifest.title.length).toBeGreaterThan(0);
      expect(manifest.description.length).toBeGreaterThan(0);
      expect(manifest.pack).toBe(EXPECTED_PACKS[toolName]);
      expect(manifest.lifecycle).toBe("stable");
      expect(manifest.visibility.mcp).toBe(true);
      expect(manifest.auth.requiredScopes).toEqual([OAUTH_REQUIRED_SCOPE]);
      expect(manifest.safety.riskLevel).toBe("read-only");
      expect(typeof manifest.safety.cacheTtlSeconds).toBe("number");
      expect(typeof manifest.safety.timeoutMs).toBe("number");
      expect(manifest.safety.costClass).toMatch(/^(none|cached-read)$/);
      expect(manifest.safety.timeoutMs).toBe(manifest.costControl.timeoutMs);
      expect(typeof manifest.costControl.class).toBe("string");
      expect(typeof manifest.costControl.requiresCache).toBe("boolean");
      expect(typeof manifest.audit.sanitizeInput).toBe("function");
      expect(typeof manifest.handler).toBe("function");
      expect(manifest.inputSchema).toBeDefined();
      expect(manifest.aws.readonly).toBe(true);
    });
  }

  for (const toolName of STRUCTURED_OUTPUT_TOOLS) {
    it(`${toolName} manifest declares outputSchema`, () => {
      const manifest = byName[toolName];
      expect(manifest.outputSchema).toBeDefined();
    });
  }

  for (const toolName of PUBLIC_TOOL_NAMES) {
    if ((CHATGPT_DYNAMIC_CATALOG_TOOLS as readonly string[]).includes(toolName)) {
      continue;
    }

    it(`${toolName} manifest declares ChatGPT catalog metadata`, () => {
      const manifest = byName[toolName];

      expect(manifest.visibility.chatgpt).toBe(true);
      expect(manifest.catalog).toBeDefined();
      expect(manifest.catalog!.docsAnchor.length).toBeGreaterThan(0);
      expect(manifest.catalog!.keywords.length).toBeGreaterThan(0);
    });
  }

  for (const toolName of CORE_TOOLS) {
    it(`${toolName} declares empty AWS metadata`, () => {
      const manifest = byName[toolName];

      expect(manifest.aws.services).toEqual([]);
      expect(manifest.aws.actions).toEqual([]);
      expect(manifest.aws.regionMode).toBe("none");
      expect(manifest.costControl.class).toBe("free");
      expect(manifest.costControl.requiresCache).toBe(false);
    });
  }

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} declares cost-control metadata`, () => {
      const manifest = byName[toolName];

      expect(isAwsBackedManifest(manifest)).toBe(true);
      expect(manifest.costControl.class).not.toBe("free");
      expect(manifest.costControl.requiresCache).toBe(true);
      expect(manifest.costControl.minCacheTtlSeconds).toBeGreaterThan(0);
      expect(manifest.safety.cacheTtlSeconds).toBeGreaterThanOrEqual(
        manifest.costControl.minCacheTtlSeconds!,
      );
    });
  }

  it("maps cost tools to paid cost-control metadata", () => {
    for (const toolName of ["get_aws_cost_summary", "get_aws_cost_by_service"] as const) {
      const manifest = byName[toolName];
      expect(manifest.costControl.class).toBe("paid");
      expect(manifest.costControl.maxDateRangeDays).toBe(COST_MAX_DATE_RANGE_DAYS);
    }

    expect(byName.get_aws_cost_by_service.costControl.maxResultCount).toBe(
      COST_MAX_SERVICE_ROWS,
    );
  });

  it("maps fanout-sensitive tools to allowed-region fanout metadata", () => {
    for (const toolName of [
      "list_ec2_instances",
      "get_cloudwatch_alarms",
      "list_lambda_functions",
      "aws_account_overview",
      "aws_observability_overview",
    ] as const) {
      const manifest = byName[toolName];
      expect(manifest.costControl.class).toBe("fanout-sensitive");
      expect(manifest.costControl.maxRegions).toBe(testContext.allowedRegions.length);
    }
  });

  it("maps aggregate cost overview to paid cost-control metadata", () => {
    const manifest = byName.aws_cost_overview;
    expect(manifest.costControl.class).toBe("paid");
    expect(manifest.costControl.maxDateRangeDays).toBe(COST_MAX_DATE_RANGE_DAYS);
    expect(manifest.costControl.maxResultCount).toBe(COST_MAX_SERVICE_ROWS);
  });

  it("maps logs tool to volume-sensitive cost-control metadata", () => {
    const manifest = byName.get_recent_log_errors;
    expect(manifest.costControl.class).toBe("volume-sensitive");
    expect(manifest.costControl.maxLookbackHours).toBe(LOGS_MAX_HOURS);
    expect(manifest.costControl.maxResultCount).toBe(LOGS_MAX_EVENTS);
  });

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} declares AWS service and action metadata`, () => {
      const manifest = byName[toolName];

      expect(manifest.aws.services.length).toBeGreaterThan(0);
      expect(manifest.aws.actions.length).toBeGreaterThan(0);
      expect(manifest.aws.capabilities.length).toBeGreaterThan(0);
      expect(manifest.aws.regionMode).not.toBe("none");
    });
  }

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} maps manifest cost metadata into execution metadata`, () => {
      const manifest = byName[toolName];
      const metadata = buildAwsExecutionMetadataFromManifest(manifest);

      expect(toolExecutionMetadataSchema.safeParse(metadata).success).toBe(true);
      expect(metadata.billing.costClass).toBe(manifest.costControl.class);
      expect(metadata.cache.ttlSeconds).toBe(manifest.safety.cacheTtlSeconds);
      expect(metadata.awsRequests.length).toBeGreaterThan(0);
    });
  }

  for (const toolName of AWS_BACKED_TOOLS) {
    it(`${toolName} paid manifest declares modeled unit costs for every capability`, () => {
      const manifest = byName[toolName];
      if (manifest.costControl.class !== "paid") {
        return;
      }

      expect(paidManifestHasModeledUnitCosts(manifest)).toBe(true);
    });
  }

  it("list_s3_buckets declares global region mode for account-level API", () => {
    expect(byName.list_s3_buckets.aws.regionMode).toBe("global");
  });

  it("createToolRegistry derives the same public tool names", () => {
    const registry = createToolRegistry(testContext);
    expect(registry.map((tool) => tool.name).sort()).toEqual([...PUBLIC_TOOL_NAMES].sort());
  });

  it("buildPublicToolList remains compatible with manifest-derived registry", () => {
    const { registry, policyContext } = buildToolRegistryState(testContext);
    const { tools } = buildPublicToolList(registry, policyContext.enabledToolNames);

    expect(tools.map((tool) => tool.name).sort()).toEqual(
      defaultExposedToolNames(manifests),
    );

    for (const tool of tools) {
      expect(tool.title?.length).toBeGreaterThan(0);
      expect(tool.description?.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["aws:read"] }]);
      expect((tool.annotations as Record<string, boolean>).readOnlyHint).toBe(true);
    }
  });

  it("getChatGptCatalogEntries discovers default exposed catalog entries", () => {
    const { registry, policyContext } = buildToolRegistryState(testContext);
    const entries = getChatGptCatalogEntries(registry, policyContext.enabledToolNames);

    expect(entries).toHaveLength(DEFAULT_EXPOSED_CATALOG_ANCHORS.length);

    for (const expected of DEFAULT_EXPOSED_CATALOG_ANCHORS) {
      const entry = entries.find((candidate) => candidate.toolName === expected.toolName);
      expect(entry).toBeDefined();
      expect(entry!.docsAnchor).toBe(expected.docsAnchor);
    }
  });

  it("getChatGptCatalogEntries includes aggregate tools when pack is enabled", () => {
    const ctx = createTestGatewayContext({
      toolExposure: {
        ...testContext.toolExposure,
        enabledToolPacks: new Set([
          ...DEFAULT_ENABLED_TOOL_PACKS,
          "aggregates",
        ]),
      },
    });
    const { registry, policyContext } = buildToolRegistryState(ctx);
    const entries = getChatGptCatalogEntries(registry, policyContext.enabledToolNames);

    expect(entries).toHaveLength(EXPECTED_CATALOG_ANCHORS.length);
  });
});

describe("tool manifest validation before AWS", () => {
  it("does not call AWS when cost summary validation fails", async () => {
    mockFetch.mockReset();

    const registry = createToolRegistry(testContext);
    const tool = registry.find((candidate) => candidate.name === "get_aws_cost_summary");
    expect(tool).toBeDefined();

    await tool!.handler({
      startDate: "invalid",
      endDate: "2025-02-01",
      granularity: "MONTHLY",
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
