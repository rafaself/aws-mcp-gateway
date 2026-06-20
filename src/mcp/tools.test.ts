import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiagnosticTools } from "./tools.js";

describe("registerDiagnosticTools", () => {
  it("registers get_gateway_status tool with handler returning static read-only gateway status", async () => {
    let capturedName: string | undefined;
    let capturedHandler: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;

    const mockServer = {
      registerTool: (
        name: string,
        _config: unknown,
        handler: (args: Record<string, unknown>) => Promise<unknown>,
      ) => {
        capturedName = name;
        capturedHandler = handler;
        return {} as ReturnType<McpServer["registerTool"]>;
      },
    } as McpServer;

    registerDiagnosticTools(mockServer);

    expect(capturedName).toBe("get_gateway_status");
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
