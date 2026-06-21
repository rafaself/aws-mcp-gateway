function normalizeHttpsOrigin(url: URL): string {
  return `${url.protocol}//${url.host}`;
}

export function validateHttpsUrl(
  value: string,
  key: string,
  errors: string[],
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    errors.push(`${key} (invalid URL)`);
    return null;
  }

  if (parsed.protocol !== "https:") {
    errors.push(`${key} (must be an https URL)`);
    return null;
  }

  if (!parsed.hostname) {
    errors.push(`${key} (invalid URL)`);
    return null;
  }

  return value;
}

export function validateOAuthIssuerUrl(
  value: string,
  errors: string[],
): string | null {
  const validated = validateHttpsUrl(value, "OAUTH_ISSUER", errors);
  if (validated === null) {
    return null;
  }

  return validated.endsWith("/") ? validated : `${validated}/`;
}

export function validateOAuthResourceUrl(
  value: string,
  errors: string[],
): string | null {
  const validated = validateHttpsUrl(value, "MCP_RESOURCE_URL", errors);
  if (validated === null) {
    return null;
  }

  try {
    const parsed = new URL(validated);
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      errors.push("MCP_RESOURCE_URL (must not include a path)");
      return null;
    }
    if (parsed.search || parsed.hash) {
      errors.push("MCP_RESOURCE_URL (must not include query or fragment)");
      return null;
    }
    return normalizeHttpsOrigin(parsed);
  } catch {
    errors.push("MCP_RESOURCE_URL (invalid URL)");
    return null;
  }
}

export function validateOAuthAudienceUrl(
  value: string,
  errors: string[],
): string | null {
  const validated = validateHttpsUrl(value, "OAUTH_AUDIENCE", errors);
  if (validated === null) {
    return null;
  }

  try {
    const parsed = new URL(validated);
    if (parsed.pathname !== "/" && parsed.pathname !== "") {
      errors.push("OAUTH_AUDIENCE (must not include a path)");
      return null;
    }
    if (parsed.search || parsed.hash) {
      errors.push("OAUTH_AUDIENCE (must not include query or fragment)");
      return null;
    }
    return normalizeHttpsOrigin(parsed);
  } catch {
    errors.push("OAUTH_AUDIENCE (invalid URL)");
    return null;
  }
}

export function validateOAuthJwksUri(
  value: string,
  errors: string[],
): string | null {
  const validated = validateHttpsUrl(value, "OAUTH_JWKS_URI", errors);
  if (validated === null) {
    return null;
  }

  try {
    const parsed = new URL(validated);
    if (!parsed.pathname.endsWith("/.well-known/jwks.json") && parsed.pathname !== "/.well-known/jwks.json") {
      errors.push("OAUTH_JWKS_URI (must end with /.well-known/jwks.json)");
      return null;
    }
    return validated;
  } catch {
    errors.push("OAUTH_JWKS_URI (invalid URL)");
    return null;
  }
}
