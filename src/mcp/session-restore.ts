import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const RESTORE_REQUEST_ID = "__aws_mcp_gateway_restore__";

export function shouldUseSessionManagement(request: Request, isInitializeRequest: boolean): boolean {
  if (isInitializeRequest) {
    return true;
  }
  return Boolean(request.headers.get("mcp-session-id"));
}

export function restoreTransportSession(
  transport: WebStandardStreamableHTTPServerTransport,
  sessionId: string,
): void {
  const stateful = transport as unknown as {
    sessionId?: string;
    _initialized: boolean;
  };
  stateful.sessionId = sessionId;
  stateful._initialized = true;
}

export async function replayInitializeToServer(
  transport: WebStandardStreamableHTTPServerTransport,
  request: Request,
): Promise<void> {
  const deliver = transport.onmessage;
  if (!deliver) {
    return;
  }

  const protocolVersion = request.headers.get("mcp-protocol-version") ?? "2024-11-05";
  const message: JSONRPCMessage = {
    jsonrpc: "2.0",
    id: RESTORE_REQUEST_ID,
    method: "initialize",
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "aws-mcp-gateway", version: "0.1.0" },
    },
  };

  await deliver(message);
}
