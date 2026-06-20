import { describe, it, expect } from "vitest";
import { GatewayError, errorResponse, mcpErrorResult } from "./public-error.js";

describe("GatewayError", () => {
  it("creates error with code and message", () => {
    const err = new GatewayError("validation_error", "Invalid input.");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("validation_error");
    expect(err.message).toBe("Invalid input.");
    expect(err.retryable).toBe(false);
  });

  it("accepts retryable flag", () => {
    const err = new GatewayError("aws_request_failed", "AWS error.", true);

    expect(err.retryable).toBe(true);
  });

  it("defaults retryable to false", () => {
    const err = new GatewayError("unauthorized", "Auth required.");

    expect(err.retryable).toBe(false);
  });

  it("toJSON returns safe payload without stack trace", () => {
    const err = new GatewayError("unauthorized", "Auth required.");

    const json = err.toJSON();

    expect(json).toEqual({
      code: "unauthorized",
      message: "Auth required.",
      retryable: false,
    });
    expect(JSON.stringify(json)).not.toContain("stack");
    expect(JSON.stringify(json)).not.toContain("Error");
  });
});

describe("errorResponse", () => {
  it("returns Response with correct status and body shape", async () => {
    const err = new GatewayError("not_found", "Not Found");

    const response = errorResponse(err, 404);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json();

    expect(body).toEqual({
      error: { code: "not_found", message: "Not Found", retryable: false },
    });
  });

  it("includes retryable in response body", async () => {
    const err = new GatewayError("aws_request_failed", "AWS error.", true);

    const response = errorResponse(err, 503);
    const body = await response.json() as { error: { retryable: boolean } };

    expect(body.error.retryable).toBe(true);
  });
});

describe("mcpErrorResult", () => {
  it("returns MCP-compatible error result with structuredContent", () => {
    const err = new GatewayError("validation_error", "Invalid input.");

    const result = mcpErrorResult(err);

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Invalid input." }]);
    expect(result.structuredContent).toEqual({
      error: { code: "validation_error", retryable: false },
    });
  });

  it("returns structuredContent without message for server-side safety", () => {
    const err = new GatewayError("aws_request_failed", "AWS request failed.", true);

    const result = mcpErrorResult(err);

    expect(result.content[0].text).toBe("AWS request failed.");
    expect(result.structuredContent.error).not.toHaveProperty("message");
  });

  it("preserves retryable in structuredContent", () => {
    const err = new GatewayError("aws_request_failed", "Retry.", true);

    const result = mcpErrorResult(err);

    expect(result.structuredContent.error.retryable).toBe(true);
  });
});
