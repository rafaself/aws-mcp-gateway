import { beforeEach, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GatewayContext } from "../../config/context.js";
import { registerSearchTool } from "./search.js";

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1"],
  mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
};

describe("registerSearchTool", () => {
  let capturedName: string | undefined;
  let capturedConfig: unknown;
  let capturedHandler: ((args: { query: string }) => Promise<unknown>) | undefined;

  const mockServer = {
    registerTool: (
      name: string,
      config: unknown,
      handler: (args: { query: string }) => Promise<unknown>,
    ) => {
      capturedName = name;
      capturedConfig = config;
      capturedHandler = handler;
      return {} as ReturnType<McpServer["registerTool"]>;
    },
  } as McpServer;

  beforeEach(() => {
    capturedName = undefined;
    capturedConfig = undefined;
    capturedHandler = undefined;
    registerSearchTool(mockServer, testContext);
  });

  it("registers the search tool with mixed security schemes", () => {
    expect(capturedName).toBe("search");
    const cfg = capturedConfig as {
      securitySchemes: Array<{ type: string }>;
      outputSchema: unknown;
    };
    expect(cfg.securitySchemes).toEqual([
      { type: "noauth" },
      { type: "oauth2", scopes: ["aws:read"] },
    ]);
    expect(cfg.outputSchema).toBeDefined();
  });

  it("returns structured search results", async () => {
    const result = (await capturedHandler!({ query: "ec2" })) as {
      structuredContent: { results: Array<{ id: string }> };
      content: Array<{ type: string; text: string }>;
    };

    expect(result.structuredContent.results.some((r) => r.id === "tool/list_ec2_instances")).toBe(
      true,
    );
    expect(result.content[0]?.text).toBe(JSON.stringify(result.structuredContent));
  });
});
