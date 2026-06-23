import {
  BUDGET_ACCOUNT_ID_LENGTH,
  BUDGET_NAME_MAX_LENGTH,
} from "../../security/limits.js";
import { ValidationError } from "../../security/errors.js";

const BUDGET_NAME_PATTERN = /^[\w+=,.@-]+$/;

export function validateBudgetName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError("validation_error", "budgetName is required.");
  }
  if (trimmed.length > BUDGET_NAME_MAX_LENGTH) {
    throw new ValidationError(
      "validation_error",
      `budgetName must be at most ${BUDGET_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (!BUDGET_NAME_PATTERN.test(trimmed)) {
    throw new ValidationError("validation_error", "budgetName contains invalid characters.");
  }
  return trimmed;
}

export function validateAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    throw new ValidationError(
      "validation_error",
      `accountId must be a ${BUDGET_ACCOUNT_ID_LENGTH}-digit AWS account ID.`,
    );
  }
  return trimmed;
}
