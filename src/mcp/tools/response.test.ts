import { describe, it, expect, vi, beforeEach } from "vitest";
import { GatewayError } from "../../errors/public-error.js";
import { safeMcpHandler } from "./response.js";

const testMeta = { toolName: "test_tool", awsService: "test-service" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("safeMcpHandler", () => {
  it("returns success result when handler succeeds", async () => {
    const handler = safeMcpHandler(testMeta, async () => ({
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
    const handler = safeMcpHandler(testMeta, async () => {
      throw new GatewayError("validation_error", "Invalid input.");
    });

    const result = await handler({}) as Record<string, unknown>;

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns generic internal_error for non-GatewayError exceptions", async () => {
    const handler = safeMcpHandler(testMeta, async () => {
      throw new Error("Unexpected crash");
    });

    const result = await handler({}) as Record<string, unknown>;

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: { code: "internal_error", retryable: false },
    });
  });

  it("emits audit event on success with console.log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool", awsService: "ce", getRegion: () => "us-east-1" },
      async () => ({
        content: [{ type: "text" as const, text: "ok" }],
        structuredContent: { data: "value" },
      }),
    );

    await handler({});

    expect(log).toHaveBeenCalledTimes(1);
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event).toMatchObject({
      event: "mcp_tool_call",
      tool: "my_tool",
      outcome: "success",
      awsService: "ce",
      region: "us-east-1",
    });
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.error).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });

  it("emits audit event on validation failure with console.log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool", sanitizeInput: () => ({ safe: true }) },
      async () => { throw new GatewayError("validation_error", "bad input"); },
    );

    await handler({ key: "secret" });

    expect(log).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event.outcome).toBe("failure");
    expect(event.error).toEqual({ code: "validation_error", retryable: false });
    expect(event.input).toEqual({ safe: true });
  });

  it("emits audit event on AWS failure with console.error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool", awsService: "ce" },
      async () => { throw new GatewayError("aws_request_failed", "AWS error", false); },
    );

    await handler({});

    expect(error).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    const event = JSON.parse(error.mock.calls[0][0]);
    expect(event.outcome).toBe("failure");
    expect(event.error).toEqual({ code: "aws_request_failed", retryable: false });
  });

  it("emits audit event on unexpected error with console.error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool" },
      async () => { throw new Error("crash"); },
    );

    await handler({});

    expect(error).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    const event = JSON.parse(error.mock.calls[0][0]);
    expect(event.outcome).toBe("failure");
    expect(event.error).toEqual({ code: "internal_error", retryable: false });
  });

  it("emits exactly one audit event per call", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool" },
      async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }),
    );

    await handler({});

    expect(log).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("emits audit event without input when no sanitizer provided", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const handler = safeMcpHandler(
      { toolName: "my_tool" },
      async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }),
    );

    await handler({ secret: "value" });

    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event.input).toBeUndefined();
  });

  it("still returns the tool result when audit sanitization throws", async () => {
    const handler = safeMcpHandler(
      {
        toolName: "my_tool",
        sanitizeInput: () => {
          throw new Error("audit failed");
        },
      },
      async () => ({
        content: [{ type: "text" as const, text: "ok" }],
      }),
    );

    await expect(handler({})).resolves.toEqual({
      content: [{ type: "text", text: "ok" }],
    });
  });

  it("still returns controlled MCP error when audit emission fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("console failed");
    });

    const handler = safeMcpHandler(
      { toolName: "my_tool" },
      async () => {
        throw new GatewayError("validation_error", "Invalid input.");
      },
    );

    const result = await handler({});

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        error: { code: "validation_error", retryable: false },
      },
    });
  });
});
