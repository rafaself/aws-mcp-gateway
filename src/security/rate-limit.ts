import { GatewayError, errorResponse } from "../errors/public-error.js";

const RATE_LIMIT_WINDOW_KEY = "window";

export interface ValidatedRateLimitConfig {
  namespace: DurableObjectNamespace;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitWindowState {
  count: number;
  resetAtMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

type RateLimitCheckPayload = {
  maxRequests: number;
  windowSeconds: number;
  nowMs: number;
};

function secondsUntil(resetAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
}

export function evaluateRateLimitWindow(
  existing: RateLimitWindowState | undefined,
  payload: RateLimitCheckPayload,
): {
  state: RateLimitWindowState;
  decision: RateLimitDecision;
} {
  const { maxRequests, nowMs, windowSeconds } = payload;
  const resetAtMs = nowMs + windowSeconds * 1000;

  if (!existing || existing.resetAtMs <= nowMs) {
    return {
      state: { count: 1, resetAtMs },
      decision: {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - 1),
        resetAtMs,
        retryAfterSeconds: windowSeconds,
      },
    };
  }

  const nextCount = existing.count + 1;
  const allowed = nextCount <= maxRequests;
  const remaining = Math.max(0, maxRequests - nextCount);

  return {
    state: {
      count: nextCount,
      resetAtMs: existing.resetAtMs,
    },
    decision: {
      allowed,
      limit: maxRequests,
      remaining,
      resetAtMs: existing.resetAtMs,
      retryAfterSeconds: secondsUntil(existing.resetAtMs, nowMs),
    },
  };
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAtMs / 1000)),
    "Retry-After": String(decision.retryAfterSeconds),
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildRateLimitIdentity(request: Request): Promise<string> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return `token:${await sha256Hex(token)}`;
    }
  }

  const forwardedFor = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? "unknown";

  return `ip:${forwardedFor}`;
}

export async function enforceRateLimit(
  request: Request,
  config: ValidatedRateLimitConfig | null,
): Promise<Response | null> {
  if (!config) {
    return null;
  }

  try {
    const identity = await buildRateLimitIdentity(request);
    const id = config.namespace.idFromName(`mcp:${identity}`);
    const stub = config.namespace.get(id);
    const decision = (await stub.fetch("https://rate-limit.internal/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        maxRequests: config.maxRequests,
        windowSeconds: config.windowSeconds,
        nowMs: Date.now(),
      } satisfies RateLimitCheckPayload),
    }).then((response) => response.json())) as RateLimitDecision;

    if (decision.allowed) {
      return null;
    }

    return errorResponse(
      new GatewayError("rate_limited", "Rate limit exceeded. Retry later.", true),
      429,
      rateLimitHeaders(decision),
    );
  } catch {
    return errorResponse(
      new GatewayError(
        "internal_error",
        "Request throttling is temporarily unavailable.",
        true,
      ),
      503,
    );
  }
}

export class AuthRateLimitDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const payload = (await request.json()) as RateLimitCheckPayload;
    const existing = await this.state.storage.get<RateLimitWindowState>(RATE_LIMIT_WINDOW_KEY);
    const result = evaluateRateLimitWindow(existing, payload);
    await this.state.storage.put(RATE_LIMIT_WINDOW_KEY, result.state);

    return Response.json(result.decision, {
      headers: rateLimitHeaders(result.decision),
    });
  }
}
