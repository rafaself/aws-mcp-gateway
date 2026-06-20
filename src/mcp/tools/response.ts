import { GatewayError, mcpErrorResult } from "../../errors/public-error.js";
import type { ToolAuditMeta } from "../audit/log.js";
import { buildAuditPayload, safeEmitAuditEvent } from "../audit/log.js";

type McpSuccessResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

export type McpToolHandler<T> = (args: T) => Promise<McpSuccessResult>;

export function safeMcpHandler<T>(
  meta: ToolAuditMeta<T>,
  fn: McpToolHandler<T>,
): (args: T) => Promise<McpSuccessResult | ReturnType<typeof mcpErrorResult>> {
  return async (args: T) => {
    const start = Date.now();

    try {
      const result = await fn(args);
      safeEmitAuditEvent(
        buildAuditPayload(meta, args, {
          event: "mcp_tool_call",
          tool: meta.toolName,
          outcome: "success",
          durationMs: Date.now() - start,
        }),
      );
      return result;
    } catch (error) {
      const duration = Date.now() - start;

      if (error instanceof GatewayError) {
        safeEmitAuditEvent(
          buildAuditPayload(meta, args, {
            event: "mcp_tool_call",
            tool: meta.toolName,
            outcome: "failure",
            durationMs: duration,
            error: { code: error.code, retryable: error.retryable },
          }),
        );
        return mcpErrorResult(error);
      }

      safeEmitAuditEvent(
        buildAuditPayload(meta, args, {
          event: "mcp_tool_call",
          tool: meta.toolName,
          outcome: "failure",
          durationMs: duration,
          error: { code: "internal_error", retryable: false },
        }),
      );
      return mcpErrorResult(
        new GatewayError("internal_error", "An unexpected error occurred."),
      );
    }
  };
}
