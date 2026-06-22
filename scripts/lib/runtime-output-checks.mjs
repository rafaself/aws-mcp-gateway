/**
 * Deterministic runtime output checks for production source.
 * Violations report file, line, rule id, and a safe static message only.
 */

export const OBSERVABILITY_PREFIX = "src/observability/";

export const RUNTIME_OUTPUT_SCAN_SKIP_PATHS = new Set([
  "scripts/lib/runtime-output-checks.mjs",
  "scripts/runtime-output-checks.test.mjs",
]);

export const RULE_MESSAGES = {
  "direct-console-bypass":
    "use src/observability logging or audit sinks instead of console.*",
};

const CONSOLE_CALL_PATTERN = /\bconsole\.(log|warn|error|info|debug)\s*\(/;

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isProductionSourcePath(relativePath) {
  if (!relativePath.startsWith("src/")) {
    return false;
  }
  if (!relativePath.endsWith(".ts")) {
    return false;
  }
  if (relativePath.endsWith(".test.ts")) {
    return false;
  }
  return true;
}

/**
 * @param {string} relativePath
 * @returns {boolean}
 */
export function isObservabilitySinkPath(relativePath) {
  return relativePath.startsWith(OBSERVABILITY_PREFIX);
}

/**
 * @param {string} line
 * @returns {string}
 */
export function stripLineComment(line) {
  const commentIndex = line.indexOf("//");
  if (commentIndex === -1) {
    return line;
  }
  return line.slice(0, commentIndex);
}

/**
 * @param {string} relativePath
 * @param {string} content
 * @returns {Array<{ file: string, line: number, ruleId: string, message: string }>}
 */
export function checkSourceFile(relativePath, content) {
  if (!isProductionSourcePath(relativePath)) {
    return [];
  }
  if (RUNTIME_OUTPUT_SCAN_SKIP_PATHS.has(relativePath)) {
    return [];
  }
  if (isObservabilitySinkPath(relativePath)) {
    return [];
  }

  const violations = [];
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const code = stripLineComment(lines[index]);
    if (!CONSOLE_CALL_PATTERN.test(code)) {
      continue;
    }

    violations.push({
      file: relativePath,
      line: index + 1,
      ruleId: "direct-console-bypass",
      message: RULE_MESSAGES["direct-console-bypass"],
    });
  }

  return violations;
}

/**
 * @param {string[]} sourcePaths
 * @param {(path: string) => string | null} readFile
 * @returns {Array<{ file: string, line: number, ruleId: string, message: string }>}
 */
export function runRuntimeOutputChecks(sourcePaths, readFile) {
  const violations = [];

  for (const filePath of sourcePaths) {
    if (!isProductionSourcePath(filePath)) {
      continue;
    }

    const content = readFile(filePath);
    if (content === null) {
      continue;
    }

    violations.push(...checkSourceFile(filePath, content));
  }

  return violations;
}

/**
 * @param {{ file: string, line: number, ruleId: string, message: string }} violation
 * @returns {string}
 */
export function formatViolation(violation) {
  return `${violation.file}:${violation.line}: ${violation.ruleId} — ${violation.message}`;
}
