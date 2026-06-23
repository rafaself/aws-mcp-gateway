import {
  SSM_MAX_REQUIRED_PARAMETER_NAMES,
  SSM_PARAMETER_NAME_MAX_LENGTH,
  SSM_PARAMETER_PREFIX_MAX_LENGTH,
} from "../../security/limits.js";
import { SsmError } from "./types.js";

const PATH_LIKE_PREFIX_PATTERN = /^\/[a-zA-Z0-9/._-]*$/;
const RELATIVE_NAME_PATTERN = /^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/;
const CONNECTION_STRING_PATTERN =
  /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\//i;
const KEY_VALUE_SECRET_PATTERN =
  /\b(?:password|secret|token|api[_-]?key)\s*=/i;
const PEM_BLOCK_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const LONG_BASE64_PATTERN = /^[A-Za-z0-9+/]{40,}={0,2}$/;

export function normalizeParameterPrefix(parameterPrefix: string): string {
  const trimmed = parameterPrefix.trim();
  if (trimmed.length > 1 && trimmed.endsWith("/")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

export function validateParameterPrefix(parameterPrefix: string): string {
  const trimmed = parameterPrefix?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new SsmError("validation_error", "parameterPrefix is required.");
  }
  if (!trimmed.startsWith("/")) {
    throw new SsmError(
      "validation_error",
      "parameterPrefix must be a path-like SSM prefix starting with '/'.",
    );
  }
  if (trimmed.length > SSM_PARAMETER_PREFIX_MAX_LENGTH) {
    throw new SsmError(
      "validation_error",
      `parameterPrefix must not exceed ${SSM_PARAMETER_PREFIX_MAX_LENGTH} characters.`,
    );
  }
  if (!PATH_LIKE_PREFIX_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      "parameterPrefix contains invalid characters for an SSM path.",
    );
  }
  if (CONNECTION_STRING_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      "parameterPrefix must not look like a connection string.",
    );
  }
  if (KEY_VALUE_SECRET_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      "parameterPrefix must not contain secret-like key=value patterns.",
    );
  }
  if (PEM_BLOCK_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      "parameterPrefix must not contain private key material.",
    );
  }

  return normalizeParameterPrefix(trimmed);
}

function validateRequiredParameterName(name: string, index: number): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must be a non-empty relative name.`,
    );
  }
  if (trimmed.startsWith("/")) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must be a relative name without a leading '/'.`,
    );
  }
  if (trimmed.length > SSM_PARAMETER_NAME_MAX_LENGTH) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must not exceed ${SSM_PARAMETER_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (!RELATIVE_NAME_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] contains invalid characters.`,
    );
  }
  if (CONNECTION_STRING_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must not look like a connection string.`,
    );
  }
  if (KEY_VALUE_SECRET_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must not contain secret-like key=value patterns.`,
    );
  }
  if (LONG_BASE64_PATTERN.test(trimmed)) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames[${index}] must not look like an encoded secret value.`,
    );
  }

  return trimmed;
}

export function validateRequiredParameterNames(requiredParameterNames: string[]): string[] {
  if (!Array.isArray(requiredParameterNames) || requiredParameterNames.length === 0) {
    throw new SsmError(
      "validation_error",
      "requiredParameterNames must be a non-empty array.",
    );
  }
  if (requiredParameterNames.length > SSM_MAX_REQUIRED_PARAMETER_NAMES) {
    throw new SsmError(
      "validation_error",
      `requiredParameterNames must not exceed ${SSM_MAX_REQUIRED_PARAMETER_NAMES} entries.`,
    );
  }

  return requiredParameterNames.map((name, index) => validateRequiredParameterName(name, index));
}

export function buildParameterPath(prefix: string, name: string): string {
  const normalizedPrefix = normalizeParameterPrefix(prefix);
  return `${normalizedPrefix}/${name}`;
}
