import { beforeEach, describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMcpToolForTest } from "../../test/register-mcp-tool-for-test.js";

const testContext = createTestGatewayContext({
  mcpResourceUrl: "https://aws-mcp-gateway.example.workers.dev",
});

describe("registerFetchTool", () => {
  let capturedName: string | undefined;
  let capturedConfig: unknown;
  let capturedHandler: ((args: { id: string }) => Promise<unknown>) | undefined;

  const mockServer = {
    registerTool: (
      name: string,
      config: unknown,
      handler: (args: { id: string }) => Promise<unknown>,
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
    registerMcpToolForTest(mockServer, testContext, "fetch");
  });

  it("registers the fetch tool with oauth security", () => {
    expect(capturedName).toBe("fetch");
    const cfg = capturedConfig as {
      securitySchemes: Array<{ type: string }>;
      outputSchema: unknown;
    };
    expect(cfg.securitySchemes).toEqual([{ type: "oauth2", scopes: ["aws:read"] }]);
    expect(cfg.outputSchema).toBeDefined();
  });

  it("returns structured catalog documents", async () => {
    const result = (await capturedHandler!({ id: "tool/get_cloudwatch_alarms" })) as {
      structuredContent: { id: string; title: string; text: string };
    };

    expect(result.structuredContent.id).toBe("tool/get_cloudwatch_alarms");
    expect(result.structuredContent.text).toContain("get_cloudwatch_alarms");
  });

  it("includes live gateway status for get_gateway_status", async () => {
    const result = (await capturedHandler!({ id: "tool/get_gateway_status" })) as {
      structuredContent: { text: string };
    };

    expect(result.structuredContent.text).toContain("Live gateway status");
    expect(result.structuredContent.text).toContain("us-east-1");
  });

  it("returns validation_error for unknown catalog ids", async () => {
    const result = (await capturedHandler!({ id: "tool/does_not_exist" })) as {
      isError: boolean;
      structuredContent: { error: { code: string } };
    };

    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe("validation_error");
  });
});
