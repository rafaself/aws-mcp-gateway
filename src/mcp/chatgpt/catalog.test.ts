import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import {
  catalogCitationUrl,
  catalogEntryId,
  fetchCatalogEntry,
  searchCatalog,
} from "./catalog.js";
import { getChatGptCatalogEntries, buildToolRegistryState } from "../tools/registry.js";

const RESOURCE_URL = "https://aws-mcp-gateway.example.workers.dev";

const testContext = createTestGatewayContext();
const { registry, policyContext } = buildToolRegistryState(testContext);
const catalogEntries = getChatGptCatalogEntries(registry, policyContext.enabledToolNames);

describe("ChatGPT catalog", () => {
  it("returns ranked search results for cost queries", () => {
    const { results } = searchCatalog("cost summary total", RESOURCE_URL, catalogEntries);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe(catalogEntryId("get_aws_cost_summary"));
    expect(results[0]?.url).toBe(
      `${RESOURCE_URL}/mcp#tool=${encodeURIComponent("get_aws_cost_summary")}`,
    );
  });

  it("returns the full catalog when the query is empty", () => {
    const { results } = searchCatalog("", RESOURCE_URL, catalogEntries);
    expect(results).toHaveLength(9);
  });

  it("fetches catalog documents by id", () => {
    const doc = fetchCatalogEntry(
      catalogEntryId("list_ec2_instances"),
      RESOURCE_URL,
      catalogEntries,
    );

    expect(doc).toMatchObject({
      id: "tool/list_ec2_instances",
      title: "List EC2 Instances",
      url: catalogCitationUrl(RESOURCE_URL, "list_ec2_instances"),
      metadata: {
        mcpTool: "list_ec2_instances",
        readOnly: "true",
        awsService: "ec2",
      },
    });
    expect(doc?.text).toContain("list_ec2_instances");
  });

  it("returns null for unknown ids", () => {
    expect(fetchCatalogEntry("tool/unknown_tool", RESOURCE_URL, catalogEntries)).toBeNull();
    expect(fetchCatalogEntry("not-a-catalog-id", RESOURCE_URL, catalogEntries)).toBeNull();
  });

  it("includes live gateway status when provided for get_gateway_status", () => {
    const liveStatus = { service: "aws-mcp-gateway", status: "ok" };
    const doc = fetchCatalogEntry(
      catalogEntryId("get_gateway_status"),
      RESOURCE_URL,
      catalogEntries,
      liveStatus,
    );

    expect(doc?.text).toContain("Live gateway status");
    expect(doc?.text).toContain('"status": "ok"');
  });
});
