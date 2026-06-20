import { describe, it, expect } from "vitest";
import { authenticateRequest } from "./auth.js";

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/mcp", { headers });
}

describe("authenticateRequest", () => {
  it("returns 401 when Authorization header is missing", () => {
    const request = makeRequest(null);
    const env = { MCP_AUTH_TOKEN: "valid-token" };

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });

  it("returns 401 when Authorization header is not Bearer", () => {
    const request = makeRequest("Basic dXNlcjpwYXNz");
    const env = { MCP_AUTH_TOKEN: "valid-token" };

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });

  it("returns 401 when bearer token is invalid", () => {
    const request = makeRequest("Bearer wrong-token");
    const env = { MCP_AUTH_TOKEN: "valid-token" };

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });

  it("allows a valid bearer token", () => {
    const request = makeRequest("Bearer valid-token");
    const env = { MCP_AUTH_TOKEN: "valid-token" };

    const result = authenticateRequest(request, env);

    expect(result).toBeNull();
  });
});
