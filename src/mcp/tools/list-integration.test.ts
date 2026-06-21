import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayContext } from "../../config/context.js";
import { createServer } from "../server.js";
import { PUBLIC_TOOL_LIST_FIELDS } from "../list-compat.js";
import { LinkedMcpTransport } from "../../test/mcp-linked-transport.js";

const testContext: GatewayContext = {
  credentials: { accessKeyId: "AKIA-test", secretAccessKey: "test-secret" },
  region: "us-east-1",
  allowedRegions: ["us-east-1", "us-west-2"],
};

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

function isToolsListResult(
  message: JSONRPCMessage,
): message is JSONRPCMessage & {
  result: { tools: Array<Record<string, unknown>> };
} {
  return (
    typeof message === "object" &&
    message !== null &&
    "result" in message &&
    typeof message.result === "object" &&
    message.result !== null &&
    "tools" in message.result &&
    Array.isArray((message.result as { tools: unknown }).tools)
  );
}

describe("tools/list MCP protocol integration", () => {
  it("returns public OAuth tool descriptors without execution metadata", async () => {
    const [clientTransport, serverTransport] = LinkedMcpTransport.createLinkedPair();
    const server = createServer(testContext);
    const client = new Client({ name: "contract-test", version: "1.0.0" });
    clients.push(client);

    const protocolMessages: JSONRPCMessage[] = [];
    clientTransport.onmessage = (message) => {
      protocolMessages.push(message);
    };

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await client.listTools();

    const listResult = protocolMessages.find(isToolsListResult);
    expect(listResult).toBeDefined();

    const tools = listResult!.result.tools;
    expect(tools).toHaveLength(8);

    const searchTool = tools.find((tool) => tool.name === "search");
    expect(searchTool?.securitySchemes).toEqual([
      { type: "noauth" },
      { type: "oauth2", scopes: ["aws:read"] },
    ]);

    for (const tool of tools) {
      if (tool.name !== "search") {
        expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["aws:read"] }]);
        expect((tool._meta as Record<string, unknown>)?.securitySchemes).toEqual([
          { type: "oauth2", scopes: ["aws:read"] },
        ]);
      }

      expect((tool.annotations as Record<string, unknown>)?.readOnlyHint).toBe(true);
      expect(tool).not.toHaveProperty("execution");

      for (const key of Object.keys(tool)) {
        expect(PUBLIC_TOOL_LIST_FIELDS).toContain(key);
      }
    }

    const statusTool = tools.find((tool) => tool.name === "get_gateway_status");
    expect((statusTool?.annotations as Record<string, unknown>)?.openWorldHint).toBe(false);
    expect((statusTool?.annotations as Record<string, unknown>)?.idempotentHint).toBe(true);
  });
});
