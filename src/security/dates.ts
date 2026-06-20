import { ValidationError } from "./errors.js";
import { COST_MAX_DATE_RANGE_DAYS } from "./limits.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(value: string): Date {
  if (!DATE_REGEX.test(value)) {
    throw new ValidationError(
      "validation_error",
      "Dates must be in YYYY-MM-DD format.",
    );
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(
      "validation_error",
      "Dates must be valid calendar dates.",
    );
  }

  return date;
}

export function validateCostDates(
  startDate: string,
  endDate: string,
  maxDays = COST_MAX_DATE_RANGE_DAYS,
): void {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (start >= end) {
    throw new ValidationError(
      "validation_error",
      "startDate must be before endDate.",
    );
  }

  const now = new Date();
  if (start > now) {
    throw new ValidationError(
      "validation_error",
      "startDate cannot be in the future.",
    );
  }
  if (end > now) {
    throw new ValidationError(
      "validation_error",
      "endDate cannot be in the future.",
    );
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays > maxDays) {
    throw new ValidationError(
      "validation_error",
      `Date range must not exceed ${maxDays} days.`,
    );
  }
}
