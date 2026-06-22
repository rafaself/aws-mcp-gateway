import { describe, it, expect, vi, beforeEach } from "vitest";
import * as auditSink from "../../observability/audit.js";
import { buildAuditPayload, safeEmitAuditEvent } from "./log.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("buildAuditPayload", () => {
  it("includes region and sanitized input from meta", () => {
    const payload = buildAuditPayload(
      {
        toolName: "get_aws_cost_summary",
        awsService: "ce",
        getRegion: (args: { region?: string }) => args.region,
        sanitizeInput: (args: { hasDateRange: boolean }) => ({
          hasDateRange: args.hasDateRange,
        }),
      },
      { region: "us-east-1", hasDateRange: true },
      {
        event: "mcp_tool_call",
        tool: "get_aws_cost_summary",
        outcome: "success",
        durationMs: 42,
      },
    );

    expect(payload).toEqual({
      event: "mcp_tool_call",
      tool: "get_aws_cost_summary",
      outcome: "success",
      durationMs: 42,
      awsService: "ce",
      region: "us-east-1",
      input: { hasDateRange: true },
    });
  });

  it("omits region and input when meta helpers throw", () => {
    const payload = buildAuditPayload(
      {
        toolName: "get_gateway_status",
        getRegion: () => {
          throw new Error("region lookup failed");
        },
        sanitizeInput: () => {
          throw new Error("sanitize failed");
        },
      },
      {},
      {
        event: "mcp_tool_call",
        tool: "get_gateway_status",
        outcome: "failure",
        durationMs: 1,
      },
    );

    expect(payload).toEqual({
      event: "mcp_tool_call",
      tool: "get_gateway_status",
      outcome: "failure",
      durationMs: 1,
      region: undefined,
      input: undefined,
    });
  });
});

describe("safeEmitAuditEvent", () => {
  it("delegates to the observability audit sink", () => {
    const emit = vi.spyOn(auditSink, "emitAuditEvent").mockImplementation(() => {});

    safeEmitAuditEvent({
      event: "mcp_tool_call",
      tool: "get_gateway_status",
      outcome: "success",
      durationMs: 5,
    });

    expect(emit).toHaveBeenCalledWith({
      event: "mcp_tool_call",
      tool: "get_gateway_status",
      outcome: "success",
      durationMs: 5,
    });
  });

  it("swallows audit sink failures", () => {
    vi.spyOn(auditSink, "emitAuditEvent").mockImplementation(() => {
      throw new Error("sink failed");
    });

    expect(() =>
      safeEmitAuditEvent({
        event: "mcp_tool_call",
        tool: "get_gateway_status",
        outcome: "success",
        durationMs: 5,
      }),
    ).not.toThrow();
  });
});
