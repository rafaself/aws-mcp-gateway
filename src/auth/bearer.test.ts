import { describe, it, expect } from "vitest";
import { authenticateLegacyBearerRequest } from "./bearer.js";
import { LOCAL_BEARER_GRANTED_SCOPES } from "./oauth/scopes.js";

function makeRequest(authHeader: string | null): Request {
  const headers = new Headers();
  if (authHeader !== null) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/mcp", { headers });
}

describe("authenticateLegacyBearerRequest", () => {
  const env = { MCP_AUTH_TOKEN: "valid-token" };

  it("returns 401 with error body when Authorization header is missing", async () => {
    const request = makeRequest(null);

    const result = authenticateLegacyBearerRequest(request, env);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected auth failure");
    }
    expect(result.response.status).toBe(401);
    const body = await result.response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("Authentication is required.");
  });

  it("returns 401 when Authorization header is not Bearer", async () => {
    const request = makeRequest("Basic dXNlcjpwYXNz");

    const result = authenticateLegacyBearerRequest(request, env);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected auth failure");
    }
    expect(result.response.status).toBe(401);
    const body = await result.response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("returns 401 when bearer token is invalid", async () => {
    const request = makeRequest("Bearer wrong-token");

    const result = authenticateLegacyBearerRequest(request, env);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected auth failure");
    }
    expect(result.response.status).toBe(401);
    const body = await result.response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
  });

  it("allows a valid bearer token with default read scopes", () => {
    const request = makeRequest("Bearer valid-token");

    const result = authenticateLegacyBearerRequest(request, env);

    expect(result).toEqual({
      ok: true,
      grantedScopes: LOCAL_BEARER_GRANTED_SCOPES,
    });
  });

  it("returns a fresh Response each call so both bodies can be read", async () => {
    const request1 = makeRequest("Bearer wrong-token");
    const request2 = makeRequest(null);

    const result1 = authenticateLegacyBearerRequest(request1, env);
    const result2 = authenticateLegacyBearerRequest(request2, env);

    expect(result1.ok).toBe(false);
    expect(result2.ok).toBe(false);
    if (result1.ok || result2.ok) {
      throw new Error("expected auth failures");
    }

    const body1 = await result1.response.json() as { error: { code: string } };
    const body2 = await result2.response.json() as { error: { code: string } };
    expect(body1.error.code).toBe("unauthorized");
    expect(body2.error.code).toBe("unauthorized");
  });
});
