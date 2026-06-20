export function extractScopes(payload: Record<string, unknown>): string[] {
  const scope = payload.scope;
  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean);
  }

  const scp = payload.scp;
  if (Array.isArray(scp)) {
    return scp.filter((value): value is string => typeof value === "string");
  }

  return [];
}

export function hasRequiredScopes(tokenScopes: string[], required: string[]): boolean {
  return required.every((scope) => tokenScopes.includes(scope));
}
