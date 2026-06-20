export type ToolAuditMeta<T = Record<string, unknown>> = {
  toolName: string;
  awsService?: string;
  getRegion?: (args: T) => string | undefined;
  sanitizeInput?: (args: T) => Record<string, unknown>;
};

export type AuditEvent = {
  event: "mcp_tool_call";
  tool: string;
  outcome: "success" | "failure";
  durationMs: number;
  awsService?: string;
  region?: string;
  error?: {
    code: string;
    retryable: boolean;
  };
  input?: Record<string, unknown>;
};

export function buildAuditPayload<T>(
  meta: ToolAuditMeta<T>,
  args: T,
  base: Omit<AuditEvent, "region" | "input" | "awsService">,
): AuditEvent {
  let region: string | undefined;
  let input: Record<string, unknown> | undefined;

  try {
    region = meta.getRegion?.(args);
  } catch {
    region = undefined;
  }

  try {
    input = meta.sanitizeInput?.(args);
  } catch {
    input = undefined;
  }

  return {
    ...base,
    awsService: meta.awsService,
    region,
    input,
  };
}

export function safeEmitAuditEvent(event: AuditEvent): void {
  try {
    emitAuditEvent(event);
  } catch {
    // Audit logging must never affect public MCP behavior.
  }
}

export function emitAuditEvent(event: AuditEvent): void {
  const line = JSON.stringify(event);
  const isControlled =
    event.outcome === "success" ||
    (event.outcome === "failure" && event.error?.code === "validation_error");

  if (isControlled) {
    console.log(line);
  } else {
    console.error(line);
  }
}
