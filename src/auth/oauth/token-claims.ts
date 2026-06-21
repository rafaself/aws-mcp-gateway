export function isLikelyJwt(token: string): boolean {
  return token.split(".").length === 3;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  return [];
}

export function hasExpectedAudience(
  payload: Record<string, unknown>,
  expectedAudience: string,
): boolean {
  const audiences = stringValues(payload.aud);
  const resources = stringValues(payload.resource);

  return audiences.includes(expectedAudience) || resources.includes(expectedAudience);
}

export function hasValidTokenTimes(
  payload: Record<string, unknown>,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const expiresAt = payload.exp;
  if (typeof expiresAt === "number" && expiresAt <= nowSeconds) {
    return false;
  }

  const notBefore = payload.nbf;
  if (typeof notBefore === "number" && notBefore > nowSeconds) {
    return false;
  }

  return true;
}
