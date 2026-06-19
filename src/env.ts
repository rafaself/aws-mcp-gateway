export interface GatewayEnv {
  AWS_ACCESS_KEY_ID: string | undefined;
  AWS_SECRET_ACCESS_KEY: string | undefined;
  AWS_REGION: string | undefined;
  AWS_ALLOWED_REGIONS: string | undefined;
  MCP_AUTH_TOKEN: string | undefined;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateEnv(env: unknown): EnvValidationResult {
  const bindings = (env ?? {}) as GatewayEnv;
  const errors: string[] = [];

  if (!bindings.AWS_ACCESS_KEY_ID) {
    errors.push("AWS_ACCESS_KEY_ID");
  }

  if (!bindings.AWS_SECRET_ACCESS_KEY) {
    errors.push("AWS_SECRET_ACCESS_KEY");
  }

  if (!bindings.AWS_REGION) {
    errors.push("AWS_REGION");
  }

  if (!bindings.AWS_ALLOWED_REGIONS) {
    errors.push("AWS_ALLOWED_REGIONS");
  } else {
    const regions = bindings.AWS_ALLOWED_REGIONS.split(",")
      .map((r) => r.trim())
      .filter(Boolean);

    if (regions.length === 0) {
      errors.push("AWS_ALLOWED_REGIONS (empty after parsing)");
    } else if (bindings.AWS_REGION && !regions.includes(bindings.AWS_REGION)) {
      errors.push("AWS_REGION (not in AWS_ALLOWED_REGIONS)");
    }
  }

  if (!bindings.MCP_AUTH_TOKEN) {
    errors.push("MCP_AUTH_TOKEN");
  }

  return { valid: errors.length === 0, errors };
}

export function envErrorResponse(
  result: EnvValidationResult,
  isAuthenticated: boolean,
): Response {
  if (isAuthenticated) {
    return Response.json(
      {
        error: {
          code: "configuration_error",
          message: `Gateway configuration is incomplete. Invalid settings: ${result.errors.join(", ")}`,
        },
      },
      { status: 503 },
    );
  }

  return Response.json(
    {
      error: {
        code: "configuration_error",
        message: "Gateway configuration is incomplete.",
      },
    },
    { status: 503 },
  );
}
