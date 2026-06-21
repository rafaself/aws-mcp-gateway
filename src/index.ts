import { createServer } from "./mcp/server.js";
import { createStreamableHttpMcpHandler } from "./mcp/streamable-http-handler.js";
import { authenticateRequest } from "./auth/index.js";
import { buildProtectedResourceMetadata } from "./auth/oauth/metadata.js";
import {
  resolveAuthMode,
  validateEnv,
  validateOAuthConfig,
  validateRateLimitConfig,
  envErrorResponse,
} from "./config/env.js";
import { buildGatewayContext } from "./config/context.js";
import { GatewayError, errorResponse } from "./errors/public-error.js";
import { AuthRateLimitDurableObject, enforceRateLimit } from "./security/rate-limit.js";
import {
  buildRequestDiagnostics,
  logInfo,
  logWarn,
} from "./observability/logging.js";

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "aws-mcp-gateway" });
    }

    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      const authModeResult = resolveAuthMode(env);
      if (!authModeResult.valid) {
        return envErrorResponse(
          { valid: false, config: null, errors: authModeResult.errors },
          false,
        );
      }
      if (authModeResult.mode !== "oauth") {
        return errorResponse(new GatewayError("not_found", "Not Found"), 404);
      }

      const oauthResult = validateOAuthConfig(env);
      if (!oauthResult.valid) {
        return envErrorResponse(
          { valid: false, config: null, errors: oauthResult.errors },
          false,
        );
      }

      return Response.json(buildProtectedResourceMetadata(oauthResult.config!));
    }

    if (url.pathname === "/mcp") {
      const reqDiag = buildRequestDiagnostics(request);
      logInfo({ ...reqDiag, phase: "mcp_request_received" });

      const rateLimitResult = validateRateLimitConfig(env);
      if (!rateLimitResult.valid) {
        logWarn({ ...reqDiag, phase: "mcp_rate_limit_config_invalid", status: 503 });
        return envErrorResponse(
          { valid: false, config: null, errors: rateLimitResult.errors },
          false,
        );
      }

      const rateLimitResponse = await enforceRateLimit(request, rateLimitResult.config);
      if (rateLimitResponse) {
        logWarn({ ...reqDiag, phase: "mcp_rate_limited", status: 429 });
        return rateLimitResponse;
      }

      const authResponse = await authenticateRequest(request, env);
      if (authResponse) {
        logWarn({
          ...reqDiag,
          phase: "mcp_auth_failed",
          status: authResponse.status,
        });
        return authResponse;
      }

      const envResult = validateEnv(env);
      if (!envResult.valid) {
        logWarn({ ...reqDiag, phase: "mcp_env_invalid", status: 503 });
        return envErrorResponse(envResult, true);
      }

      const gatewayCtx = buildGatewayContext(envResult.config);
      const handler = createStreamableHttpMcpHandler({
        createServer: () => createServer(gatewayCtx),
      });
      logInfo({ ...reqDiag, phase: "mcp_handler_start" });
      const response = await handler(request);
      logInfo({
        ...reqDiag,
        phase: "mcp_handler_response",
        status: response.status,
        responseContentType: response.headers.get("content-type") ?? "",
      });
      return response;
    }

    return errorResponse(new GatewayError("not_found", "Not Found"), 404);
  },
} satisfies ExportedHandler;

export { AuthRateLimitDurableObject };
