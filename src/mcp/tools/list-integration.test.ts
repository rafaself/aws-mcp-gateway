import { afterEach, describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../../test/gateway-context-fixture.js";
import { defaultResolvedToolExposure } from "../../config/tool-exposure.js";
import type { ToolPack } from "./manifest.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.js";
import { PUBLIC_TOOL_LIST_FIELDS } from "./public-list.js";
import { LinkedMcpTransport } from "../../test/mcp-linked-transport.js";

const testContext = createTestGatewayContext();

const OAUTH_SECURITY = [{ type: "oauth2" as const, scopes: ["aws:read"] }];

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

    for (const tool of tools) {
      expect(tool.securitySchemes).toEqual(OAUTH_SECURITY);
      expect((tool._meta as Record<string, unknown>)?.securitySchemes).toEqual(OAUTH_SECURITY);

      expect((tool.annotations as Record<string, unknown>)?.readOnlyHint).toBe(true);
      expect(tool).not.toHaveProperty("execution");

      for (const key of Object.keys(tool)) {
        expect(PUBLIC_TOOL_LIST_FIELDS).toContain(key);
      }
    }

    const statusTool = tools.find((tool) => tool.name === "get_gateway_status");
    expect((statusTool?.annotations as Record<string, unknown>)?.openWorldHint).toBe(false);
    expect((statusTool?.annotations as Record<string, unknown>)?.idempotentHint).toBe(true);
    expect(statusTool?.outputSchema).toMatchObject({ type: "object" });
  });

  it("omits disabled tools from tools/list", async () => {
    const restrictedContext = createTestGatewayContext({
      toolExposure: {
        ...defaultResolvedToolExposure(),
        disabledTools: new Set(["get_cloudwatch_alarms"]),
      },
    });
    const [clientTransport, serverTransport] = LinkedMcpTransport.createLinkedPair();
    const server = createServer(restrictedContext);
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
    const tools = listResult!.result.tools;

    expect(tools).toHaveLength(7);
    expect(tools.map((tool) => tool.name)).not.toContain("get_cloudwatch_alarms");
  });

  it("lists only tools from enabled packs", async () => {
    const costOnlyContext = createTestGatewayContext({
      toolExposure: {
        enabledToolPacks: new Set<ToolPack>(["cost"]),
        enabledTools: [],
        disabledTools: new Set(),
        maxRiskLevel: "read-only",
      },
    });
    const [clientTransport, serverTransport] = LinkedMcpTransport.createLinkedPair();
    const server = createServer(costOnlyContext);
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
    const toolNames = listResult!.result.tools.map((tool) => tool.name).sort();

    expect(toolNames).toEqual(["get_aws_cost_by_service", "get_aws_cost_summary"]);
  });
});
