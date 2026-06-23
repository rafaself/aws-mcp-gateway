import { describe, expect, it } from "vitest";
import { createTestGatewayContext } from "../test/gateway-context-fixture.js";
import { createServer } from "./server.js";
import { createStreamableHttpMcpHandler } from "./streamable-http-handler.js";

const testContext = createTestGatewayContext();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MCP_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};

async function readSseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const dataLines = text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));
  const payload = dataLines.at(-1);
  if (!payload) {
    throw new Error(`No SSE data event in response: ${text}`);
  }
  return JSON.parse(payload) as unknown;
}

function createHandler() {
  return createStreamableHttpMcpHandler({
    createServer: () => createServer(testContext),
  });
}

describe("streamable HTTP MCP handler", () => {
  it("returns mcp-session-id on initialize responses", async () => {
    const handler = createHandler();
    const response = await handler(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "contract-test", version: "1.0.0" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const sessionId = response.headers.get("mcp-session-id");
    expect(sessionId).toMatch(UUID_REGEX);

    const body = (await readSseJson(response)) as {
      result: { serverInfo: { name: string } };
    };
    expect(body.result.serverInfo.name).toBe("aws-mcp-gateway");
  });

  it("accepts tools/list with mcp-session-id from initialize", async () => {
    const handler = createHandler();
    const initResponse = await handler(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "contract-test", version: "1.0.0" },
          },
        }),
      }),
    );
    const sessionId = initResponse.headers.get("mcp-session-id");
    expect(sessionId).toMatch(UUID_REGEX);
    await initResponse.text();

    const listResponse = await handler(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: {
          ...MCP_HEADERS,
          "mcp-session-id": sessionId!,
          "mcp-protocol-version": "2024-11-05",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      }),
    );

    expect(listResponse.status).toBe(200);
    expect(listResponse.headers.get("mcp-session-id")).toBe(sessionId);
    const body = (await readSseJson(listResponse)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(body.result.tools).toHaveLength(23);
  });

  it("accepts tools/list without mcp-session-id in stateless mode", async () => {
    const handler = createHandler();
    const response = await handler(
      new Request("https://gateway.example.com/mcp", {
        method: "POST",
        headers: MCP_HEADERS,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await readSseJson(response)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(body.result.tools).toHaveLength(23);
  });
});
