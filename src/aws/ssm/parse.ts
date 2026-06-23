import type {
  SsmParameterInventoryEntry,
  SsmRawParameterMetadata,
} from "./types.js";

const SUSPICIOUS_DESCRIPTION_PATTERN =
  /\b(?:placeholder|changeme|change[-_ ]?me|todo|replace[-_ ]?me|example|dummy|test[-_ ]?value)\b/i;

export function detectSuspiciousMetadata(description?: string): boolean {
  if (!description) {
    return false;
  }
  return SUSPICIOUS_DESCRIPTION_PATTERN.test(description);
}

export function normalizeParameterMetadata(
  raw: SsmRawParameterMetadata,
  requiredName: string,
): SsmParameterInventoryEntry {
  const path = raw.Name ?? "";
  const entry: SsmParameterInventoryEntry = {
    name: requiredName,
    path,
    exists: true,
  };

  if (raw.Type) {
    entry.type = raw.Type;
  }
  if (typeof raw.Version === "number") {
    entry.version = raw.Version;
  }
  if (typeof raw.LastModifiedDate === "number") {
    entry.lastModifiedDate = new Date(raw.LastModifiedDate).toISOString();
  }
  if (raw.KeyId) {
    entry.keyId = raw.KeyId;
  }

  const suspicious = detectSuspiciousMetadata(raw.Description);
  if (suspicious) {
    entry.suspiciousMetadata = true;
  }

  return entry;
}

export function buildMissingParameterEntry(
  requiredName: string,
  path: string,
): SsmParameterInventoryEntry {
  return {
    name: requiredName,
    path,
    exists: false,
  };
}

export function indexParametersByName(
  parameters: SsmRawParameterMetadata[],
): Map<string, SsmRawParameterMetadata> {
  const map = new Map<string, SsmRawParameterMetadata>();
  for (const parameter of parameters) {
    if (parameter.Name) {
      map.set(parameter.Name, parameter);
    }
  }
  return map;
}
