export const LOCAL_BEARER_GRANTED_SCOPES = ["aws:read"] as const;

function appendStringScopes(scopes: Set<string>, value: unknown): void {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }
  for (const scope of value.split(/\s+/)) {
    if (scope) {
      scopes.add(scope);
    }
  }
}

function appendArrayScopes(scopes: Set<string>, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) {
      scopes.add(item);
    }
  }
}

export function extractScopes(payload: Record<string, unknown>): string[] {
  const scopes = new Set<string>();
  appendStringScopes(scopes, payload.scope);
  appendArrayScopes(scopes, payload.scp);
  appendArrayScopes(scopes, payload.permissions);
  return [...scopes];
}

export function hasRequiredScopes(tokenScopes: string[], required: string[]): boolean {
  return required.every((scope) => tokenScopes.includes(scope));
}
