import { describe, it, expect, vi, beforeEach } from "vitest";
import { emitAuditEvent } from "./log.js";
import type { AuditEvent } from "./log.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

function parseAuditLine(spy: ReturnType<typeof vi.fn>): AuditEvent {
  const line = spy.mock.calls[0][0];
  return JSON.parse(line) as AuditEvent;
}

describe("emitAuditEvent", () => {
  describe("console.log", () => {
    it("emits via console.log on success", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 42,
        awsService: "ce",
        region: "us-east-1",
        input: { hasDateRange: true },
      });

      expect(log).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });

    it("emits via console.log on validation failure", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "failure",
        durationMs: 5,
        error: { code: "validation_error", retryable: false },
      });

      expect(log).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe("console.error", () => {
    it("emits via console.error on AWS request failure", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "failure",
        durationMs: 120,
        awsService: "ce",
        error: { code: "aws_request_failed", retryable: false },
      });

      expect(error).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    });

    it("emits via console.error on internal error", () => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_gateway_status",
        outcome: "failure",
        durationMs: 1,
        error: { code: "internal_error", retryable: false },
      });

      expect(error).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    });
  });

  describe("event shape", () => {
    it("includes all fields for success event", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 120,
        awsService: "ce",
        region: "us-east-1",
        input: { hasDateRange: true, granularity: "MONTHLY" },
      });

      const log = vi.mocked(console.log);
      const event = parseAuditLine(log);
      expect(event).toEqual({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 120,
        awsService: "ce",
        region: "us-east-1",
        input: { hasDateRange: true, granularity: "MONTHLY" },
      });
    });

    it("includes error fields for failure event", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_recent_log_errors",
        outcome: "failure",
        durationMs: 35,
        awsService: "logs",
        region: "sa-east-1",
        error: { code: "validation_error", retryable: false },
        input: { hasLogGroupName: true, hours: 24, limit: 50 },
      });

      const error = vi.mocked(console.error);
      const event = parseAuditLine(error);
      expect(event).toEqual({
        event: "mcp_tool_call",
        tool: "get_recent_log_errors",
        outcome: "failure",
        durationMs: 35,
        awsService: "logs",
        region: "sa-east-1",
        error: { code: "validation_error", retryable: false },
        input: { hasLogGroupName: true, hours: 24, limit: 50 },
      });
    });

    it("includes duration as a non-negative number", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_gateway_status",
        outcome: "success",
        durationMs: 0,
      });

      const log = vi.mocked(console.log);
      const event = parseAuditLine(log);
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("sanitization", () => {
    it("never contains credentials in the output", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 10,
        input: { hasDateRange: true },
      });

      const log = vi.mocked(console.log);
      const line = log.mock.calls[0][0] as string;
      expect(line).not.toContain("AKIA");
      expect(line).not.toContain("secret");
      expect(line).not.toContain("accessKeyId");
      expect(line).not.toContain("secretAccessKey");
    });

    it("never contains bearer tokens", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 10,
        input: { hasDateRange: true },
      });

      const log = vi.mocked(console.log);
      const line = log.mock.calls[0][0] as string;
      expect(line).not.toContain("Authorization");
      expect(line).not.toContain("bearer");
      expect(line).not.toContain("MCP_AUTH_TOKEN");
    });

    it("never contains raw AWS response bodies", () => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 10,
        input: { hasDateRange: true },
      });

      const log = vi.mocked(console.log);
      const line = log.mock.calls[0][0] as string;
      expect(line).not.toContain("ResultsByTime");
      expect(line).not.toContain("UnblendedCost");
      expect(line).not.toContain("TimePeriod");
    });

    it("never contains raw log messages", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      emitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_recent_log_errors",
        outcome: "failure",
        durationMs: 10,
        error: { code: "aws_request_failed", retryable: false },
        input: { hasLogGroupName: true },
      });

      const error = vi.mocked(console.error);
      const line = error.mock.calls[0][0] as string;
      expect(line).not.toContain("ERROR");
      expect(line).not.toContain("Exception");
      expect(line).not.toContain("logGroupName");
      expect(line).not.toContain("/aws/lambda");
    });
  });
});
