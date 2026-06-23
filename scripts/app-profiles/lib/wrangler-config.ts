import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRegions } from "../../../src/security/regions.js";
import { resolveIndexKey } from "../../../src/profiles/keys.js";

export const APP_CONFIG_BINDING = "AWS_MCP_APP_CONFIG";

export type AppProfileCliConfig = {
  configPath: string;
  allowedRegions: string[];
  indexKey: string;
  hasAppConfigBinding: boolean;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function stripJsoncComments(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < content.length) {
    const char = content[i];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      i++;
      continue;
    }

    if (char === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") {
        i++;
      }
      continue;
    }

    if (char === "/" && content[i + 1] === "*") {
      i += 2;
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) {
        i++;
      }
      i += 2;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

function removeTrailingCommas(content: string): string {
  return content.replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonc(content: string): JsonValue {
  const sanitized = removeTrailingCommas(stripJsoncComments(content));
  return JSON.parse(sanitized) as JsonValue;
}

function readStringField(record: Record<string, JsonValue>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function loadAppProfileCliConfig(configPath: string): AppProfileCliConfig {
  const absolutePath = resolve(configPath);
  const content = readFileSync(absolutePath, "utf8");
  const parsed = parseJsonc(content);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid wrangler config: ${configPath}`);
  }

  const root = parsed as Record<string, JsonValue>;
  const vars = root.vars;
  const varsRecord =
    typeof vars === "object" && vars !== null && !Array.isArray(vars)
      ? (vars as Record<string, JsonValue>)
      : {};

  const allowedRegionsRaw = readStringField(varsRecord, "AWS_ALLOWED_REGIONS");
  if (!allowedRegionsRaw) {
    throw new Error(`AWS_ALLOWED_REGIONS is required in ${configPath} vars.`);
  }

  const allowedRegions = parseRegions(allowedRegionsRaw);
  if (allowedRegions.length === 0) {
    throw new Error(`AWS_ALLOWED_REGIONS is empty in ${configPath}.`);
  }

  const indexKey = resolveIndexKey(readStringField(varsRecord, "AWS_MCP_APP_PROFILE_INDEX_KEY"));

  const kvNamespaces = root.kv_namespaces;
  let hasAppConfigBinding = false;
  if (Array.isArray(kvNamespaces)) {
    for (const entry of kvNamespaces) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        continue;
      }
      const binding = readStringField(entry as Record<string, JsonValue>, "binding");
      if (binding === APP_CONFIG_BINDING) {
        hasAppConfigBinding = true;
        break;
      }
    }
  }

  return {
    configPath: absolutePath,
    allowedRegions,
    indexKey,
    hasAppConfigBinding,
  };
}
