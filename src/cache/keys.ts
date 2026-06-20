const KEY_PREFIX = "ce";

function normalizeParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  const parts = keys.map((k) => `${k}=${String(params[k])}`);
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
