function unauthorizedResponse(): Response {
  return Response.json(
    {
      error: {
        code: "unauthorized",
        message: "Authentication is required.",
      },
    },
    { status: 401 },
  );
}

export function authenticateRequest(request: Request, env: unknown): Response | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorizedResponse();
  }

  const token = authHeader.slice(7);
  const bindings = env as Record<string, string | undefined>;

  if (token !== bindings.MCP_AUTH_TOKEN) {
    return unauthorizedResponse();
  }

  return null;
}
