import { describe, it, expect, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTool } from "./status.js";

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
    registerStatusTool(mockServer);
  });

  it("registers get_gateway_status tool", () => {
    expect(capturedName).toBe("get_gateway_status");
    expect(capturedHandler).toBeDefined();
  });

  it("includes description about gateway status", () => {
    const cfg = capturedConfig as { description?: string };
    expect(cfg.description).toContain("gateway status");
  });

  it("returns stable content with service, status, and mode keys", async () => {
    const result = await capturedHandler!({}) as { content: Array<{ type: string; text: string }> };

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            service: "aws-mcp-gateway",
            status: "ok",
            mode: "read-only",
          }),
        },
      ],
    });
  });

  it("does not include structuredContent", async () => {
    const result = await capturedHandler!({}) as Record<string, unknown>;
    expect(result).not.toHaveProperty("structuredContent");
  });
});
