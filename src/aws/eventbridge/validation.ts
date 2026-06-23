import {
  EVENTBRIDGE_DEFAULT_LIMIT,
  EVENTBRIDGE_MAX_LIMIT,
  EVENTBRIDGE_RULE_PREFIX_MAX_LENGTH,
  EVENTBRIDGE_SCHEDULE_PREFIX_MAX_LENGTH,
} from "../../security/limits.js";
import { ValidationError } from "../../security/errors.js";

export function validateRuleNamePrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined) return undefined;
  const trimmed = prefix.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > EVENTBRIDGE_RULE_PREFIX_MAX_LENGTH) {
    throw new ValidationError(
      "validation_error",
      `ruleNamePrefix must be at most ${EVENTBRIDGE_RULE_PREFIX_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export function validateScheduleNamePrefix(prefix: string | undefined): string | undefined {
  if (prefix === undefined) return undefined;
  const trimmed = prefix.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > EVENTBRIDGE_SCHEDULE_PREFIX_MAX_LENGTH) {
    throw new ValidationError(
      "validation_error",
      `scheduleNamePrefix must be at most ${EVENTBRIDGE_SCHEDULE_PREFIX_MAX_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export function validateLimit(limit: number | undefined): number {
  if (limit === undefined) return EVENTBRIDGE_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError("validation_error", "limit must be a positive integer.");
  }
  if (limit > EVENTBRIDGE_MAX_LIMIT) {
    throw new ValidationError(
      "validation_error",
      `limit must be at most ${EVENTBRIDGE_MAX_LIMIT}.`,
    );
  }
  return limit;
}
