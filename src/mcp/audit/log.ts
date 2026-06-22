import { emitAuditEvent, type AuditEvent } from "../../observability/audit.js";

export type { AuditEvent };

export type ToolAuditMeta<T = Record<string, unknown>> = {
  toolName: string;
  awsService?: string;
  getRegion?: (args: T) => string | undefined;
  sanitizeInput?: (args: T) => Record<string, unknown>;
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
