import { LOGS_MAX_MESSAGE_LENGTH } from "../../security/limits.js";
import { redactSensitiveText } from "../../security/redaction.js";

export const DEFAULT_FILTER_PATTERN = "?ERROR ?Error ?error ?Exception ?exception ?WARN ?Warn ?warn";

export function normalizeTimestamp(epochMs: number | undefined): string {
  if (epochMs === undefined) return "";
  return new Date(epochMs).toISOString();
}

export function truncateMessage(message: string | undefined): string {
  if (!message) return "";
  if (message.length <= LOGS_MAX_MESSAGE_LENGTH) return message;
  const suffix = "...";
  return message.slice(0, LOGS_MAX_MESSAGE_LENGTH - suffix.length) + suffix;
}

export function sanitizeLogMessage(message: string | undefined): string {
  if (!message) return "";
  return truncateMessage(redactSensitiveText(message));
}
