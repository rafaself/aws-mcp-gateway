import { describe, it, expect, beforeEach } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const testContext = createTestGatewayContext({ allowedRegions: ["us-east-1"] });

describe("registerStatusTool", () => {
  let capturedName: string | undefined;
  let capturedConfig: unknown;
  let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

  const mockServer = {
    registerTool: (
      name: string,
      config: unknown,
      handler: (args: Record<string, unknown>) => Promise<unknown>,
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
    registerMcpToolForTest(mockServer, testContext, "get_gateway_status");
  });

  it("registers get_gateway_status tool", () => {
    expect(capturedName).toBe("get_gateway_status");
    expect(capturedHandler).toBeDefined();
  });

  it("includes description about gateway status", () => {
    const cfg = capturedConfig as { description?: string };
    expect(cfg.description).toContain("gateway status");
  });

  it("declares outputSchema", () => {
    const cfg = capturedConfig as { outputSchema?: unknown };
    expect(cfg.outputSchema).toBeDefined();
  });

  it("returns stable structured content with service, status, and mode keys", async () => {
    const result = (await capturedHandler!({})) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: Record<string, string>;
    };

    expect(result.structuredContent).toEqual({
      service: "aws-mcp-gateway",
      status: "ok",
      mode: "read-only",
    });
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify(result.structuredContent),
      },
    ]);
  });
});
