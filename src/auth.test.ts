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
  const env = { MCP_AUTH_TOKEN: "valid-token" };

  it("returns 401 with error body when Authorization header is missing", async () => {
    const request = makeRequest(null);

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Authentication is required.");
  });

  it("returns 401 when Authorization header is not Bearer", async () => {
    const request = makeRequest("Basic dXNlcjpwYXNz");

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 401 when bearer token is invalid", async () => {
    const request = makeRequest("Bearer wrong-token");

    const result = authenticateRequest(request, env);

    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
    const body = await result!.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("allows a valid bearer token", () => {
    const request = makeRequest("Bearer valid-token");

    const result = authenticateRequest(request, env);

    expect(result).toBeNull();
  });

  it("returns a fresh Response each call so both bodies can be read", async () => {
    const request1 = makeRequest("Bearer wrong-token");
    const request2 = makeRequest(null);

    const result1 = authenticateRequest(request1, env);
    const result2 = authenticateRequest(request2, env);

    const body1 = await result1!.json() as { error: { code: string } };
    const body2 = await result2!.json() as { error: { code: string } };
    expect(body1.error.code).toBe("unauthorized");
    expect(body2.error.code).toBe("unauthorized");
  });
});
