import { describe, it, expect } from "vitest";
import { GatewayError } from "../../errors/public-error.js";
import { safeMcpHandler } from "./response.js";

describe("safeMcpHandler", () => {
  it("returns success result when handler succeeds", async () => {
    const handler = safeMcpHandler(async () => ({
      content: [{ type: "text" as const, text: "ok" }],
      structuredContent: { data: "value" },
    }));

    const result = await handler({});

    expect(result).toEqual({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { data: "value" },
    });
  });

  it("returns mcpErrorResult when handler throws GatewayError", async () => {
    const handler = safeMcpHandler(async () => {
      throw new GatewayError("validation_error", "Invalid input.");
    });

    const result = await handler({}) as Record<string, unknown>;

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns generic internal_error for non-GatewayError exceptions", async () => {
    const handler = safeMcpHandler(async () => {
      throw new Error("Unexpected crash");
    });

    const result = await handler({}) as Record<string, unknown>;

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "internal_error", retryable: false },
    });
  });
});
