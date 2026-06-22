/**
 * Deterministic legacy-symbol checks for production source.
 * Violations report file, line, and rule id only.
 */

export const LEGACY_SYMBOL_PATTERN =
  /legacy-bearer|authenticateLegacyBearerRequest|create[A-Za-z]+ToolDefinition|manifestToGatewayDefinitionForContext/;

export const LEGACY_SYMBOL_SCAN_SKIP_PATHS = new Set([
  "scripts/lib/legacy-symbol-checks.mjs",
  "scripts/legacy-symbol-checks.test.mjs",
]);

export const RULE_MESSAGES = {
  "legacy-symbol":
    "remove legacy bearer auth, tool-definition factories, or manifest bridge helpers",
};

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isLegacySymbolScanPath(relativePath) {
  if (!relativePath.startsWith("src/")) {
    return false;
  }
  if (!relativePath.endsWith(".ts")) {
    return false;
  }
  if (LEGACY_SYMBOL_SCAN_SKIP_PATHS.has(relativePath)) {
    return false;
  }
  return true;
}

/**
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function checkLegacySymbols(content, filePath) {
  const violations = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (LEGACY_SYMBOL_PATTERN.test(lines[i])) {
      violations.push({
        file: filePath,
        line: i + 1,
        ruleId: "legacy-symbol",
      });
    }
  }

  return violations;
}

/**
 * @param {string[]} sourcePaths
 * @param {(path: string) => string | null} readFile
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function runLegacySymbolChecks(sourcePaths, readFile) {
  const violations = [];

  for (const filePath of sourcePaths) {
    if (!isLegacySymbolScanPath(filePath)) {
      continue;
    }

    const content = readFile(filePath);
    if (content === null) {
      continue;
    }

    violations.push(...checkLegacySymbols(content, filePath));
  }

  return violations;
}

/**
 * @param {{ file: string, line: number, ruleId: string }} violation
 * @returns {string}
 */
export function formatViolation(violation) {
  const message = RULE_MESSAGES[violation.ruleId] ?? violation.ruleId;
  return `${violation.file}:${violation.line}: ${message}`;
}
