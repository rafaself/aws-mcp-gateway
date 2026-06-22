import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkSourceFile,
  formatViolation,
  isObservabilitySinkPath,
  isProductionSourcePath,
  runRuntimeOutputChecks,
  stripLineComment,
} from "./lib/runtime-output-checks.mjs";

describe("isProductionSourcePath", () => {
  it("accepts production TypeScript under src", () => {
    assert.equal(isProductionSourcePath("src/index.ts"), true);
    assert.equal(isProductionSourcePath("src/cache/kv.ts"), true);
  });

  it("rejects tests, scripts, and non-src paths", () => {
    assert.equal(isProductionSourcePath("src/cache/kv.test.ts"), false);
    assert.equal(isProductionSourcePath("scripts/check-runtime-output.mjs"), false);
    assert.equal(isProductionSourcePath("README.md"), false);
  });
});

describe("isObservabilitySinkPath", () => {
  it("allows observability sinks only", () => {
    assert.equal(isObservabilitySinkPath("src/observability/logging.ts"), true);
    assert.equal(isObservabilitySinkPath("src/observability/audit.ts"), true);
    assert.equal(isObservabilitySinkPath("src/cache/kv.ts"), false);
  });
});

describe("stripLineComment", () => {
  it("removes trailing comments before scanning", () => {
    assert.equal(
      stripLineComment('  // console.log("ignored")'),
      "  ",
    );
    assert.equal(
      stripLineComment('console.log("bad"); // not ignored'),
      'console.log("bad"); ',
    );
  });
});

describe("checkSourceFile", () => {
  it("flags direct console usage outside observability", () => {
    const violations = checkSourceFile(
      "src/cache/kv.ts",
      'console.warn("cache failed", key);',
    );

    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "direct-console-bypass");
    assert.equal(violations[0].line, 1);
    assert.match(violations[0].message, /observability/);
  });

  it("allows console usage inside observability sinks", () => {
    const violations = checkSourceFile(
      "src/observability/logging.ts",
      "console.info(sanitized);",
    );

    assert.equal(violations.length, 0);
  });

  it("ignores commented console calls", () => {
    const violations = checkSourceFile(
      "src/cache/kv.ts",
      "// console.warn('ignored');",
    );

    assert.equal(violations.length, 0);
  });

  it("skips its own fixture paths", () => {
    const violations = checkSourceFile(
      "scripts/lib/runtime-output-checks.mjs",
      "console.log('fixture');",
    );

    assert.equal(violations.length, 0);
  });
});

describe("formatViolation", () => {
  it("reports path, line, rule id, and safe message only", () => {
    const formatted = formatViolation({
      file: "src/cache/kv.ts",
      line: 13,
      ruleId: "direct-console-bypass",
      message: "use src/observability logging or audit sinks instead of console.*",
    });

    assert.equal(
      formatted,
      "src/cache/kv.ts:13: direct-console-bypass — use src/observability logging or audit sinks instead of console.*",
    );
    assert.doesNotMatch(formatted, /AKIA|secret|Bearer/);
  });
});

describe("runRuntimeOutputChecks", () => {
  it("aggregates violations across source files", () => {
    const files = {
      "src/cache/kv.ts": "console.warn('bad');",
      "src/observability/logging.ts": "console.info(obj);",
      "src/index.ts": "logInfo({ phase: 'ok' });",
    };

    const violations = runRuntimeOutputChecks(Object.keys(files), (path) => files[path] ?? null);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, "src/cache/kv.ts");
  });
});
