import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiagnosticTools } from "./tools.js";

describe("registerDiagnosticTools", () => {
  it("get_gateway_status returns static read-only gateway status", async () => {
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

    const mockServer = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (args: Record<string, unknown>) => Promise<unknown>,
      ) => {
        capturedHandler = handler;
        return {} as ReturnType<McpServer["registerTool"]>;
      },
    } as McpServer;

    registerDiagnosticTools(mockServer);

    expect(capturedHandler).toBeDefined();

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
});
