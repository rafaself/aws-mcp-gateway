import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRpcRequest } from "./initialize-request.js";
import {
  replayInitializeToServer,
  restoreTransportSession,
  shouldUseSessionManagement,
} from "./session-restore.js";

export type StreamableHttpMcpHandlerOptions = {
  createServer: () => McpServer;
  isInitializeRequest?: (request: Request) => Promise<boolean>;
};

export function createStreamableHttpMcpHandler(
  options: StreamableHttpMcpHandlerOptions,
): (request: Request) => Promise<Response> {
  const detectInitialize = options.isInitializeRequest ?? isInitializeRpcRequest;

  return async (request: Request): Promise<Response> => {
    const isInit = await detectInitialize(request);
    const sessionIdHeader = request.headers.get("mcp-session-id");
    const useSessions = shouldUseSessionManagement(request, isInit);
    const transport = new WebStandardStreamableHTTPServerTransport({
      ...(useSessions ? { sessionIdGenerator: () => crypto.randomUUID() } : {}),
    });
    const server = options.createServer();
    await server.connect(transport);

    if (!isInit && sessionIdHeader) {
      restoreTransportSession(transport, sessionIdHeader);
      await replayInitializeToServer(transport, request);
    }

    try {
      return await transport.handleRequest(request);
    } catch (error) {
      console.error("MCP handler error:", error);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error",
          },
          id: null,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}
