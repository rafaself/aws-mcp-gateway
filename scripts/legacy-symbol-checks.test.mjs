import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkLegacySymbols,
  formatViolation,
  isLegacySymbolScanPath,
  runLegacySymbolChecks,
} from "./lib/legacy-symbol-checks.mjs";

describe("isLegacySymbolScanPath", () => {
  it("scans production source files only", () => {
    assert.equal(isLegacySymbolScanPath("src/index.ts"), true);
    assert.equal(isLegacySymbolScanPath("src/foo/bar.test.ts"), true);
    assert.equal(isLegacySymbolScanPath("scripts/check-legacy-symbols.mjs"), false);
    assert.equal(isLegacySymbolScanPath("scripts/lib/legacy-symbol-checks.mjs"), false);
  });
});

describe("checkLegacySymbols", () => {
  it("flags legacy bearer auth symbols", () => {
    const violations = checkLegacySymbols(
      'const mode = "legacy-bearer";\n',
      "src/auth/mode.ts",
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "legacy-symbol");
    assert.equal(violations[0].line, 1);
  });

  it("flags legacy tool-definition factories", () => {
    const violations = checkLegacySymbols(
      "export function createCostToolDefinition() {}\n",
      "src/mcp/tools/definitions/cost.ts",
    );
    assert.equal(violations.length, 1);
  });

  it("allows clean source", () => {
    const violations = checkLegacySymbols(
      'export const AUTH_MODE = "oauth";\n',
      "src/config/env.ts",
    );
    assert.equal(violations.length, 0);
  });
});

describe("runLegacySymbolChecks", () => {
  it("aggregates violations across files", () => {
    const files = {
      "src/auth/legacy.ts": 'authenticateLegacyBearerRequest();\n',
      "src/mcp/tools/registry.ts": "export const tools = [];\n",
    };

    const violations = runLegacySymbolChecks(Object.keys(files), (path) => files[path] ?? null);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, "src/auth/legacy.ts");
  });
});

describe("formatViolation", () => {
  it("includes a readable message", () => {
    const formatted = formatViolation({
      file: "src/auth/mode.ts",
      line: 4,
      ruleId: "legacy-symbol",
    });
    assert.match(formatted, /src\/auth\/mode\.ts:4:/);
    assert.match(formatted, /legacy bearer auth/);
  });
});
