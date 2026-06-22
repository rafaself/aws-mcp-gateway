/**
 * Deterministic repository safety checks for public-safe CI.
 * Violations report file, line, and rule id only — never secret values.
 */

export const ALLOWED_ENV_FILES = new Set([
  ".env.example",
  ".env.deploy.example",
  ".dev.vars.example",
]);

export const EXACT_FORBIDDEN_PATHS = new Set([
  ".env",
  ".dev.vars",
  ".env.deploy.local",
  "package-lock.json",
]);

export const PREFIX_FORBIDDEN_PATHS = [
  ".wrangler/",
  "node_modules/",
  "dist/",
  "coverage/",
  ".cursor/",
  ".opencode/",
];

export const MAINTAINER_DENYLIST = [
  "aws-mcp-gateway.rafaondjango.workers.dev",
  "dev-e11vv5o0nhbqsq70.us.auth0.com",
  "5e3e4ee0a3194c7e9a34256b0febda8a",
];

/** Paths that define or exercise denylist/pattern fixtures — skip self-matching rules. */
export const MAINTAINER_SCAN_SKIP_PATHS = new Set([
  "scripts/lib/repository-safety-checks.mjs",
  "scripts/repository-safety-checks.test.mjs",
]);

export const SECRET_SCAN_SKIP_PATHS = new Set([
  "scripts/repository-safety-checks.test.mjs",
]);

export const SENSITIVE_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "MCP_AUTH_TOKEN",
  "CLOUDFLARE_API_TOKEN",
];

export const SENSITIVE_ENV_KEY_SUFFIXES = ["_CLIENT_SECRET", "_MGMT_CLIENT_SECRET"];

export const LOCAL_ENV_FILENAMES = new Set([
  ".dev.vars",
  ".env.deploy.local",
  ".env",
]);

export const PUBLIC_CONFIG_FILES = {
  ".env.example": { mode: "docs-only" },
  ".env.deploy.example": { mode: "example-env" },
  ".dev.vars.example": { mode: "example-env" },
  "wrangler.example.jsonc": { mode: "wrangler" },
  "wrangler.jsonc": { mode: "wrangler" },
};

export const WRANGLER_PLACEHOLDER_VARS = [
  "MCP_RESOURCE_URL",
  "OAUTH_ISSUER",
  "OAUTH_AUDIENCE",
  "OAUTH_JWKS_URI",
];

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".gz",
  ".pdf",
]);

const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const SENSITIVE_ASSIGNMENT_PATTERN = new RegExp(
  `^\\s*(${SENSITIVE_ENV_KEYS.join("|")}|\\w+(${SENSITIVE_ENV_KEY_SUFFIXES.join("|")}))\\s*=\\s*(.+?)\\s*(?:#.*)?$`,
);

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isForbiddenTrackedPath(filePath) {
  if (EXACT_FORBIDDEN_PATHS.has(filePath)) {
    return true;
  }

  for (const prefix of PREFIX_FORBIDDEN_PATHS) {
    if (filePath.startsWith(prefix) || filePath === prefix.slice(0, -1)) {
      return true;
    }
  }

  const basename = filePath.includes("/") ? filePath.slice(filePath.lastIndexOf("/") + 1) : filePath;

  if (basename.startsWith(".env.") && !ALLOWED_ENV_FILES.has(basename)) {
    return true;
  }

  return false;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isPlaceholderValue(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (trimmed === "..." || trimmed === '"..."' || trimmed === "'...'") {
    return true;
  }
  if (trimmed.includes("...")) {
    return true;
  }
  if (trimmed.includes("<your-")) {
    return true;
  }
  if (trimmed.includes("{callback_id}")) {
    return true;
  }
  if (/^<[^>]+>$/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Strip single-line // comments from JSONC (string-aware).
 * @param {string} content
 * @returns {string}
 */
export function stripJsoncComments(content) {
  const lines = content.split("\n");
  const stripped = [];

  for (const line of lines) {
    let inString = false;
    let escaped = false;
    let cutIndex = line.length;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\" && inString) {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString && char === "/" && line[i + 1] === "/") {
        cutIndex = i;
        break;
      }
    }

    stripped.push(line.slice(0, cutIndex).trimEnd());
  }

  return stripped.join("\n");
}

/**
 * Remove trailing commas before object/array closers (JSONC → JSON).
 * @param {string} jsonText
 * @returns {string}
 */
export function stripJsoncTrailingCommas(jsonText) {
  return jsonText.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function structuralNormalize(value) {
  if (Array.isArray(value)) {
    return value.map(structuralNormalize);
  }
  if (value !== null && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = structuralNormalize(value[key]);
    }
    return result;
  }
  return null;
}

/**
 * @param {string} content
 * @returns {unknown}
 */
export function parseJsoncStructure(content) {
  const jsonText = stripJsoncTrailingCommas(stripJsoncComments(content));
  return structuralNormalize(JSON.parse(jsonText));
}

/**
 * Compare wrangler.jsonc and wrangler.example.jsonc structure (keys/nesting), ignoring leaf values.
 * @param {string} wranglerContent
 * @param {string} exampleContent
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function checkWranglerConfigParity(wranglerContent, exampleContent) {
  try {
    const wranglerStructure = parseJsoncStructure(wranglerContent);
    const exampleStructure = parseJsoncStructure(exampleContent);
    const wranglerJson = JSON.stringify(wranglerStructure);
    const exampleJson = JSON.stringify(exampleStructure);

    if (wranglerJson === exampleJson) {
      return [];
    }

    return [
      {
        file: "wrangler.jsonc",
        line: 0,
        ruleId: "wrangler-config-parity",
      },
    ];
  } catch {
    return [
      {
        file: "wrangler.jsonc",
        line: 0,
        ruleId: "wrangler-config-parse-error",
      },
    ];
  }
}

/**
 * @param {string} line
 * @returns {Array<{ ruleId: string }>}
 */
export function scanLineForSecrets(line) {
  const violations = [];

  if (AWS_ACCESS_KEY_PATTERN.test(line)) {
    violations.push({ ruleId: "secret-like-value" });
  }

  if (PRIVATE_KEY_PATTERN.test(line)) {
    violations.push({ ruleId: "secret-like-value" });
  }

  const assignmentMatch = line.match(SENSITIVE_ASSIGNMENT_PATTERN);
  if (assignmentMatch) {
    const value = assignmentMatch[3];
    if (!isPlaceholderValue(value)) {
      violations.push({ ruleId: "secret-like-value" });
    }
  }

  return violations;
}

/**
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function checkMaintainerDenylist(content, filePath) {
  const violations = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const denied of MAINTAINER_DENYLIST) {
      if (line.includes(denied)) {
        violations.push({
          file: filePath,
          line: i + 1,
          ruleId: "maintainer-default",
        });
      }
    }
  }

  return violations;
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isTextFile(filePath) {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) {
    return true;
  }
  const ext = filePath.slice(dot).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

/**
 * @param {string} content
 * @param {string} filePath
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function scanFileForSecrets(content, filePath) {
  const violations = [];
  const lines = content.split("\n");
  const isLocalEnv = LOCAL_ENV_FILENAMES.has(
    filePath.includes("/") ? filePath.slice(filePath.lastIndexOf("/") + 1) : filePath,
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineViolations = scanLineForSecrets(line);

    for (const v of lineViolations) {
      violations.push({
        file: filePath,
        line: i + 1,
        ruleId: v.ruleId,
      });
    }

    if (isLocalEnv) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const eq = trimmed.indexOf("=");
        const value = trimmed.slice(eq + 1).trim();
        if (!isPlaceholderValue(value)) {
          violations.push({
            file: filePath,
            line: i + 1,
            ruleId: "secret-like-value",
          });
        }
      }
    }
  }

  return violations;
}

/**
 * @param {string} content
 * @param {string} filePath
 * @param {{ mode: string }} config
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function checkPublicConfigFile(content, filePath, config) {
  const violations = [];
  const lines = content.split("\n");

  if (config.mode === "docs-only") {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      if (/^\s*[A-Z0-9_]+\s*=/.test(line) && !trimmed.startsWith("#")) {
        const eq = trimmed.indexOf("=");
        const value = trimmed.slice(eq + 1).trim();
        if (!isPlaceholderValue(value)) {
          violations.push({
            file: filePath,
            line: i + 1,
            ruleId: "public-config-unsafe",
          });
        }
      }
    }
    return violations;
  }

  if (config.mode === "example-env") {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
      const value = trimmed.slice(trimmed.indexOf("=") + 1).trim();

      const isSensitive =
        SENSITIVE_ENV_KEYS.includes(key) ||
        SENSITIVE_ENV_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));

      if (isSensitive && !isPlaceholderValue(value)) {
        violations.push({
          file: filePath,
          line: i + 1,
          ruleId: "public-config-unsafe",
        });
      }
    }
    return violations;
  }

  if (config.mode === "wrangler") {
    if (!MAINTAINER_SCAN_SKIP_PATHS.has(filePath)) {
      violations.push(...checkMaintainerDenylist(content, filePath));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const varName of WRANGLER_PLACEHOLDER_VARS) {
        const match = line.match(new RegExp(`"${varName}"\\s*:\\s*"([^"]*)"`));
        if (match && !isPlaceholderValue(match[1])) {
          violations.push({
            file: filePath,
            line: i + 1,
            ruleId: "public-config-unsafe",
          });
        }
      }

      const kvMatch = line.match(/"id"\s*:\s*"([^"]*)"/);
      if (kvMatch && line.includes('"binding"')) {
        const kvId = kvMatch[1];
        if (!isPlaceholderValue(kvId)) {
          violations.push({
            file: filePath,
            line: i + 1,
            ruleId: "public-config-unsafe",
          });
        }
      }
    }
  }

  return violations;
}

/**
 * @param {string} filePath
 * @param {string} content
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function checkTrackedFile(filePath, content) {
  const violations = [];

  if (isForbiddenTrackedPath(filePath)) {
    violations.push({ file: filePath, line: 0, ruleId: "forbidden-tracked-path" });
    return violations;
  }

  const publicConfig = PUBLIC_CONFIG_FILES[filePath];
  if (publicConfig) {
    violations.push(...checkPublicConfigFile(content, filePath, publicConfig));
  }

  if (isTextFile(filePath)) {
    if (!SECRET_SCAN_SKIP_PATHS.has(filePath)) {
      violations.push(...scanFileForSecrets(content, filePath));
    }
    if (!publicConfig && !MAINTAINER_SCAN_SKIP_PATHS.has(filePath)) {
      violations.push(...checkMaintainerDenylist(content, filePath));
    }
  }

  return violations;
}

/**
 * @param {string[]} trackedPaths
 * @param {(path: string) => string | null} readFile
 * @returns {Array<{ file: string, line: number, ruleId: string }>}
 */
export function runRepositorySafetyChecks(trackedPaths, readFile) {
  const violations = [];

  for (const filePath of trackedPaths) {
    if (isForbiddenTrackedPath(filePath)) {
      violations.push({ file: filePath, line: 0, ruleId: "forbidden-tracked-path" });
      continue;
    }

    const content = readFile(filePath);
    if (content === null) {
      continue;
    }

    violations.push(...checkTrackedFile(filePath, content));
  }

  const trackedSet = new Set(trackedPaths);
  if (trackedSet.has("wrangler.jsonc") && trackedSet.has("wrangler.example.jsonc")) {
    const wranglerContent = readFile("wrangler.jsonc");
    const exampleContent = readFile("wrangler.example.jsonc");
    if (wranglerContent !== null && exampleContent !== null) {
      violations.push(...checkWranglerConfigParity(wranglerContent, exampleContent));
    }
  }

  return violations;
}

/**
 * @param {{ file: string, line: number, ruleId: string }} violation
 * @returns {string}
 */
export function formatViolation(violation) {
  if (violation.line === 0) {
    return `${violation.file}: ${violation.ruleId}`;
  }
  return `${violation.file}:${violation.line}: ${violation.ruleId}`;
}
