export async function isInitializeRpcRequest(request: Request): Promise<boolean> {
  if (request.method !== "POST") {
    return false;
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return false;
  }

  try {
    const body = (await request.clone().json()) as unknown;
    if (Array.isArray(body)) {
      return body.length === 1 && hasInitializeMethod(body[0]);
    }
    return hasInitializeMethod(body);
  } catch {
    return false;
  }
}

function hasInitializeMethod(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "method" in body &&
    (body as { method?: unknown }).method === "initialize"
  );
}
