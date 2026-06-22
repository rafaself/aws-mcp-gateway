export const TOOL_PACKS = [
  "core",
  "cost",
  "inventory",
  "observability",
  "security",
] as const;

export type ConfigToolPack = (typeof TOOL_PACKS)[number];

export const DEFAULT_ENABLED_TOOL_PACKS: readonly ConfigToolPack[] = [
  "core",
  "cost",
  "inventory",
  "observability",
];

export const PUBLIC_TOOL_NAMES = [
  "search",
  "fetch",
  "get_gateway_status",
  "get_aws_cost_summary",
  "get_aws_cost_by_service",
  "list_ec2_instances",
  "get_cloudwatch_alarms",
  "get_recent_log_errors",
] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];

export const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(PUBLIC_TOOL_NAMES);

export const KNOWN_TOOL_PACKS: ReadonlySet<ConfigToolPack> = new Set(TOOL_PACKS);

export const SUPPORTED_RISK_LEVELS = ["read-only"] as const;

export type ConfigToolRiskLevel = (typeof SUPPORTED_RISK_LEVELS)[number];

export const DEFAULT_MAX_RISK_LEVEL: ConfigToolRiskLevel = "read-only";

export type ResolvedToolExposure = {
  enabledToolPacks: ReadonlySet<ConfigToolPack>;
  /** Empty means all tools in enabled packs. */
  enabledTools: readonly string[];
  disabledTools: ReadonlySet<string>;
  maxRiskLevel: ConfigToolRiskLevel;
};

export type ValidatedToolExposureConfig = ResolvedToolExposure;

export function defaultResolvedToolExposure(): ResolvedToolExposure {
  return {
    enabledToolPacks: new Set(DEFAULT_ENABLED_TOOL_PACKS),
    enabledTools: [],
    disabledTools: new Set(),
    maxRiskLevel: DEFAULT_MAX_RISK_LEVEL,
  };
}

export function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parsePackList(
  raw: string | null,
  key: string,
  errors: string[],
  fallback: readonly ConfigToolPack[],
): ConfigToolPack[] {
  if (raw === null) {
    return [...fallback];
  }

  const entries = parseCommaSeparatedList(raw);
  if (entries.length === 0) {
    errors.push(`${key} (empty after parsing)`);
    return [...fallback];
  }

  const packs: ConfigToolPack[] = [];
  for (const entry of entries) {
    if (!KNOWN_TOOL_PACKS.has(entry as ConfigToolPack)) {
      errors.push(`${key} (unknown pack: ${entry})`);
      continue;
    }
    packs.push(entry as ConfigToolPack);
  }

  return packs;
}

export function parseToolNameList(
  raw: string | null,
  key: string,
  errors: string[],
): string[] {
  if (raw === null) {
    return [];
  }

  const entries = parseCommaSeparatedList(raw);
  for (const entry of entries) {
    if (!KNOWN_TOOL_NAMES.has(entry)) {
      errors.push(`${key} (unknown tool: ${entry})`);
    }
  }

  return entries;
}

export function parseMaxRiskLevel(
  raw: string | null,
  key: string,
  errors: string[],
  fallback: ConfigToolRiskLevel,
): ConfigToolRiskLevel {
  if (raw === null) {
    return fallback;
  }

  if (!SUPPORTED_RISK_LEVELS.includes(raw as ConfigToolRiskLevel)) {
    errors.push(`${key} (unsupported risk level: ${raw})`);
    return fallback;
  }

  return raw as ConfigToolRiskLevel;
}

function readOptionalString(bindings: Record<string, unknown>, key: string): string | null {
  const value = bindings[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateToolExposureConfig(
  bindings: Record<string, unknown>,
  errors: string[],
): ValidatedToolExposureConfig | null {
  const enabledPacks = parsePackList(
    readOptionalString(bindings, "AWS_MCP_ENABLED_TOOL_PACKS"),
    "AWS_MCP_ENABLED_TOOL_PACKS",
    errors,
    DEFAULT_ENABLED_TOOL_PACKS,
  );
  const enabledTools = parseToolNameList(
    readOptionalString(bindings, "AWS_MCP_ENABLED_TOOLS"),
    "AWS_MCP_ENABLED_TOOLS",
    errors,
  );
  const disabledTools = parseToolNameList(
    readOptionalString(bindings, "AWS_MCP_DISABLED_TOOLS"),
    "AWS_MCP_DISABLED_TOOLS",
    errors,
  );
  const maxRiskLevel = parseMaxRiskLevel(
    readOptionalString(bindings, "AWS_MCP_MAX_RISK_LEVEL"),
    "AWS_MCP_MAX_RISK_LEVEL",
    errors,
    DEFAULT_MAX_RISK_LEVEL,
  );

  if (errors.length > 0) {
    return null;
  }

  return {
    enabledToolPacks: new Set(enabledPacks),
    enabledTools,
    disabledTools: new Set(disabledTools),
    maxRiskLevel,
  };
}
