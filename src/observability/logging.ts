export type SafeLogValue = string | number | boolean | string[];

export type SafeLogEvent = Record<string, SafeLogValue>;

const FORBIDDEN_KEY =
  /authorization|cookie|token|secret|password|credential|jwt|access_key|client_secret/i;

const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 50;

const SERVICE_NAME = "aws-mcp-gateway";

function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEY.test(key);
}

function capString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function sanitizeValue(value: unknown): SafeLogValue | undefined {
  if (typeof value === "string") {
    return capString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .slice(0, MAX_ARRAY_LENGTH)
      .map(capString);
    return items;
  }
  return undefined;
}

export function sanitizeLogEvent(event: Record<string, unknown>): SafeLogEvent {
  const sanitized: SafeLogEvent = { service: SERVICE_NAME };

  for (const [key, value] of Object.entries(event)) {
    if (isForbiddenKey(key)) {
      continue;
    }
    const safeValue = sanitizeValue(value);
    if (safeValue !== undefined) {
      sanitized[key] = safeValue;
    }
  }

  return sanitized;
}

function emit(level: "info" | "warn" | "error", event: Record<string, unknown>): void {
  const sanitized = sanitizeLogEvent(event);
  if (level === "info") {
    console.info(sanitized);
    return;
  }
  if (level === "warn") {
    console.warn(sanitized);
    return;
  }
  console.error(sanitized);
}

export function logInfo(event: Record<string, unknown>): void {
  emit("info", event);
}

export function logWarn(event: Record<string, unknown>): void {
  emit("warn", event);
}

export function logError(event: Record<string, unknown>): void {
  emit("error", event);
}

export type UserAgentFamily = "openai-mcp" | "aiohttp" | "other";
export type RequestKind = "empty_post" | "json_rpc" | "other";

function classifyUserAgentFamily(userAgent: string | null): UserAgentFamily {
  if (!userAgent) {
    return "other";
  }
  if (userAgent.startsWith("openai-mcp/")) {
    return "openai-mcp";
  }
  if (userAgent.includes("aiohttp")) {
    return "aiohttp";
  }
  return "other";
}

function classifyRequestKind(request: Request): RequestKind {
  if (request.method === "POST") {
    const contentLength = request.headers.get("content-length");
    if (contentLength === "0") {
      return "empty_post";
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return "json_rpc";
  }

  return "other";
}

export function buildRequestDiagnostics(request: Request): SafeLogEvent {
  const url = new URL(request.url);
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength =
    contentLengthHeader !== null && contentLengthHeader !== ""
      ? Number(contentLengthHeader)
      : undefined;

  return {
    service: SERVICE_NAME,
    path: url.pathname,
    method: request.method,
    hasAuthorization: request.headers.has("Authorization"),
    contentType: request.headers.get("content-type") ?? "",
    accept: request.headers.get("accept") ?? "",
    ...(contentLength !== undefined && Number.isFinite(contentLength)
      ? { contentLength }
      : {}),
    userAgentFamily: classifyUserAgentFamily(request.headers.get("user-agent")),
    requestKind: classifyRequestKind(request),
  };
}
