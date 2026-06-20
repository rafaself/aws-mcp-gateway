const KEY_PREFIX = "ce";

type Serialized =
  | { t: "null" }
  | { t: "undefined" }
  | { t: "string"; v: string }
  | { t: "number"; v: number }
  | { t: "boolean"; v: boolean }
  | { t: "array"; v: Serialized[] }
  | { t: "object"; v: Array<[string, Serialized]> };

function serializeForKey(value: unknown): Serialized {
  if (value === null) return { t: "null" };
  if (value === undefined) return { t: "undefined" };
  if (typeof value === "string") return { t: "string", v: value };
  if (typeof value === "number") return { t: "number", v: value };
  if (typeof value === "boolean") return { t: "boolean", v: value };

  if (Array.isArray(value)) {
    return { t: "array", v: value.map(serializeForKey) };
  }

  if (typeof value === "object") {
    return {
      t: "object",
      v: Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, serializeForKey((value as Record<string, unknown>)[key])] as [string, Serialized]),
    };
  }

  return { t: "string", v: String(value) };
}

export function serializeValue(value: unknown): string {
  return JSON.stringify(serializeForKey(value));
}

function normalizeParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  const parts = keys.map((k) => `${k}=${serializeValue(params[k])}`);
  return parts.join("&");
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildCacheKey(
  toolName: string,
  params: Record<string, unknown>,
): Promise<string> {
  const normalized = normalizeParams(params);
  const input = `${toolName}:${normalized}`;
  const hash = await sha256Hex(input);
  return `${KEY_PREFIX}:${hash}`;
}
