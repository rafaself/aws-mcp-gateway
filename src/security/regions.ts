import { ValidationError } from "./errors.js";

export function parseRegions(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((r) => r.trim()).filter(Boolean);
}

export function validateAllowedRegions(allowedRegions: string[]): void {
  if (allowedRegions.length === 0) {
    throw new ValidationError(
      "validation_error",
      "The allowed regions list is empty.",
    );
  }
}

export function validateRegion(region: string, allowedRegions: string[]): void {
  validateAllowedRegions(allowedRegions);

  if (!allowedRegions.includes(region)) {
    throw new ValidationError(
      "validation_error",
      `Region "${region}" is not in the allowed regions list.`,
    );
  }
}

export function resolveRegions(
  requestedRegions: string[] | undefined,
  allowedRegions: string[],
): string[] {
  validateAllowedRegions(allowedRegions);

  if (!requestedRegions || requestedRegions.length === 0) {
    return [...allowedRegions];
  }

  for (const region of requestedRegions) {
    if (!allowedRegions.includes(region)) {
      throw new ValidationError(
        "validation_error",
        `Region "${region}" is not in the allowed regions list.`,
      );
    }
  }

  return requestedRegions;
}
