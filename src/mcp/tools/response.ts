import { GatewayError, mcpErrorResult } from "../../errors/public-error.js";

type McpSuccessResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
};

export type McpToolHandler<T> = (args: T) => Promise<McpSuccessResult>;

export function safeMcpHandler<T>(
  fn: McpToolHandler<T>,
): (args: T) => Promise<McpSuccessResult | ReturnType<typeof mcpErrorResult>> {
  return async (args: T) => {
    try {
      return await fn(args);
    } catch (error) {
      if (error instanceof GatewayError) {
        return mcpErrorResult(error);
      }
      return mcpErrorResult(
        new GatewayError("internal_error", "An unexpected error occurred."),
      );
    }
  };
}
