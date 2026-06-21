import { describe, expect, it, vi } from "vitest";
import {
  buildRateLimitIdentity,
  enforceRateLimit,
  evaluateRateLimitWindow,
} from "./rate-limit.js";

describe("evaluateRateLimitWindow", () => {
  it("starts a fresh window when no previous state exists", () => {
    const result = evaluateRateLimitWindow(undefined, {
      maxRequests: 3,
      windowSeconds: 60,
      nowMs: 1_000,
    });

    expect(result.state).toEqual({
      count: 1,
      resetAtMs: 61_000,
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.decision.remaining).toBe(2);
  });

  it("rejects requests above the window limit", () => {
    const result = evaluateRateLimitWindow(
      {
        count: 3,
        resetAtMs: 61_000,
      },
      {
        maxRequests: 3,
        windowSeconds: 60,
        nowMs: 5_000,
      },
    );

    expect(result.decision.allowed).toBe(false);
    expect(result.decision.remaining).toBe(0);
    expect(result.decision.retryAfterSeconds).toBe(56);
  });
});

describe("buildRateLimitIdentity", () => {
  it("hashes bearer tokens instead of using raw token values", async () => {
    const request = new Request("https://gateway.example.com/mcp", {
      headers: {
        Authorization: "Bearer secret-token",
      },
    });

    const identity = await buildRateLimitIdentity(request);

    expect(identity.startsWith("token:")).toBe(true);
    expect(identity).not.toContain("secret-token");
  });

  it("falls back to client ip when bearer token is absent", async () => {
    const request = new Request("https://gateway.example.com/mcp", {
      headers: {
        "CF-Connecting-IP": "203.0.113.8",
      },
    });

    await expect(buildRateLimitIdentity(request)).resolves.toBe("ip:203.0.113.8");
  });
});

describe("enforceRateLimit", () => {
  it("returns null when request is allowed", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAtMs: 10_000,
        retryAfterSeconds: 60,
      }),
    );

    const response = await enforceRateLimit(
      new Request("https://gateway.example.com/mcp"),
      {
        maxRequests: 10,
        windowSeconds: 60,
        namespace: {
          idFromName: () => "stub-id" as never,
          get: () => ({ fetch }) as never,
        } as never,
      },
    );

    expect(response).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns 429 when request is denied", async () => {
    const response = await enforceRateLimit(
      new Request("https://gateway.example.com/mcp"),
      {
        maxRequests: 1,
        windowSeconds: 60,
        namespace: {
          idFromName: () => "stub-id" as never,
          get: () =>
            ({
              fetch: async () =>
                Response.json({
                  allowed: false,
                  limit: 1,
                  remaining: 0,
                  resetAtMs: 10_000,
                  retryAfterSeconds: 42,
                }),
            }) as never,
        } as never,
      },
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("42");
    await expect(response?.json()).resolves.toEqual({
      error: {
        code: "rate_limited",
        message: "Rate limit exceeded. Retry later.",
        retryable: true,
      },
    });
  });
});
