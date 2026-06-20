export type GatewayErrorCode =
  | "unauthorized"
  | "configuration_error"
  | "validation_error"
  | "aws_request_failed"
  | "not_found"
  | "internal_error";

export interface GatewayErrorPayload {
  code: GatewayErrorCode;
  message: string;
  retryable: boolean;
}

export class GatewayError extends Error {
  public readonly code: GatewayErrorCode;
  public readonly retryable: boolean;

  constructor(code: GatewayErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.retryable = retryable;
  }

  toJSON(): GatewayErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export function errorResponse(
  error: GatewayError,
  status: number,
  headers?: Record<string, string>,
): Response {
  return Response.json({ error: error.toJSON() }, { status, headers });
}

export function mcpErrorResult(error: GatewayError): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  structuredContent: { error: { code: string; retryable: boolean } };
} {
  return {
    content: [{ type: "text" as const, text: error.message }],
    isError: true as const,
    structuredContent: {
      error: {
        code: error.code,
        retryable: error.retryable,
      },
    },
  };
}
