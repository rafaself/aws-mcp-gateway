import { describe, expect, it, vi } from "vitest";
import {
  buildRequestDiagnostics,
  logInfo,
  logWarn,
  sanitizeLogEvent,
} from "./logging.js";

describe("sanitizeLogEvent", () => {
  it("removes authorization-like keys", () => {
    const result = sanitizeLogEvent({
      phase: "oauth_token_missing",
      authorization: "Bearer secret-token",
      Authorization: "Bearer secret-token",
    });

    expect(result).toEqual({
      service: "aws-mcp-gateway",
      phase: "oauth_token_missing",
    });
  });

  it("removes token, secret, cookie, and jwt-like keys", () => {
    const result = sanitizeLogEvent({
      phase: "test",
      access_token: "opaque",
      client_secret: "shh",
      cookie: "session=abc",
      jwt: "eyJhbGciOiJIUzI1NiJ9",
      password: "pw",
      credential: "cred",
      AWS_ACCESS_KEY_ID: "AKIA123",
    });

    expect(result).toEqual({
      service: "aws-mcp-gateway",
      phase: "test",
    });
  });

  it("preserves safe diagnostic fields", () => {
    const result = sanitizeLogEvent({
      phase: "oauth_scope_denied",
      requiredScopes: ["aws:read"],
      extractedScopes: ["openid"],
      claimKeys: ["scope", "sub"],
      hasScopeClaim: true,
      status: 403,
    });

    expect(result).toEqual({
      service: "aws-mcp-gateway",
      phase: "oauth_scope_denied",
      requiredScopes: ["aws:read"],
      extractedScopes: ["openid"],
      claimKeys: ["scope", "sub"],
      hasScopeClaim: true,
      status: 403,
    });
  });

  it("caps long strings", () => {
    const long = "a".repeat(250);
    const result = sanitizeLogEvent({ phase: "test", note: long });

    expect(result.note).toHaveLength(201);
    expect(String(result.note).endsWith("…")).toBe(true);
  });

  it("caps large arrays", () => {
    const items = Array.from({ length: 60 }, (_, index) => `scope-${index}`);
    const result = sanitizeLogEvent({ phase: "test", claimKeys: items });

    const claimKeys = result.claimKeys;
    if (!Array.isArray(claimKeys)) {
      throw new Error("expected claimKeys array");
    }
    expect(claimKeys).toHaveLength(50);
    expect(claimKeys[0]).toBe("scope-0");
    expect(claimKeys[49]).toBe("scope-49");
  });
});

describe("logWarn", () => {
  it("emits a sanitized object, not a string", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logWarn({
      phase: "oauth_scope_denied",
      requiredScopes: ["aws:read"],
      access_token: "must-not-appear",
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const emitted = warnSpy.mock.calls[0]?.[0];
    expect(typeof emitted).toBe("object");
    expect(emitted).toEqual({
      service: "aws-mcp-gateway",
      phase: "oauth_scope_denied",
      requiredScopes: ["aws:read"],
    });

    warnSpy.mockRestore();
  });
});

describe("buildRequestDiagnostics", () => {
  it("classifies openai-mcp user agents without logging raw UA", () => {
    const request = new Request("https://gateway.example.com/mcp?debug=1", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Content-Length": "12",
        "User-Agent": "openai-mcp/1.0.0",
      },
    });

    const diagnostics = buildRequestDiagnostics(request);

    expect(diagnostics).toEqual({
      service: "aws-mcp-gateway",
      path: "/mcp",
      method: "POST",
      hasAuthorization: true,
      contentType: "application/json",
      accept: "application/json, text/event-stream",
      contentLength: 12,
      userAgentFamily: "openai-mcp",
      requestKind: "json_rpc",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("openai-mcp/1.0.0");
    expect(JSON.stringify(diagnostics)).not.toContain("debug=1");
    expect(JSON.stringify(diagnostics)).not.toContain("Bearer");
  });

  it("classifies empty POST requests", () => {
    const request = new Request("https://gateway.example.com/mcp", {
      method: "POST",
      headers: {
        "Content-Length": "0",
      },
    });

    expect(buildRequestDiagnostics(request).requestKind).toBe("empty_post");
  });
});

describe("logInfo", () => {
  it("emits sanitized objects", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo({ phase: "mcp_request_received", path: "/mcp" });

    expect(infoSpy).toHaveBeenCalledWith({
      service: "aws-mcp-gateway",
      phase: "mcp_request_received",
      path: "/mcp",
    });

    infoSpy.mockRestore();
  });
});
