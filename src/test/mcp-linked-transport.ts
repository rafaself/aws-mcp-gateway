import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export class LinkedMcpTransport implements Transport {
  private peer?: LinkedMcpTransport;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  static createLinkedPair(): [LinkedMcpTransport, LinkedMcpTransport] {
    const clientSide = new LinkedMcpTransport();
    const serverSide = new LinkedMcpTransport();
    clientSide.peer = serverSide;
    serverSide.peer = clientSide;
    return [clientSide, serverSide];
  }

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    const deliver = this.peer?.onmessage;
    if (!deliver) {
      return;
    }
    queueMicrotask(() => {
      deliver.call(this.peer, message);
    });
  }

  async close(): Promise<void> {
    this.onclose?.();
    this.peer?.onclose?.();
  }
}
