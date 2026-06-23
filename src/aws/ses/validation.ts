import { SES_CONFIGURATION_SET_NAME_MAX_LENGTH } from "../../security/limits.js";
import { ValidationError } from "../../security/errors.js";

const CONFIGURATION_SET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export function validateConfigurationSetName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError("validation_error", "configurationSetName is required.");
  }
  if (trimmed.length > SES_CONFIGURATION_SET_NAME_MAX_LENGTH) {
    throw new ValidationError(
      "validation_error",
      `configurationSetName must be at most ${SES_CONFIGURATION_SET_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (!CONFIGURATION_SET_NAME_PATTERN.test(trimmed)) {
    throw new ValidationError(
      "validation_error",
      "configurationSetName contains invalid characters.",
    );
  }
  return trimmed;
}
