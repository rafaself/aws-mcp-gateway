import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkMaintainerDenylist,
  checkPublicConfigFile,
  checkTrackedFile,
  formatViolation,
  isForbiddenTrackedPath,
  isPlaceholderValue,
  runRepositorySafetyChecks,
  scanLineForSecrets,
} from "./lib/repository-safety-checks.mjs";

describe("isForbiddenTrackedPath", () => {
  it("allows public example env files", () => {
    assert.equal(isForbiddenTrackedPath(".env.example"), false);
    assert.equal(isForbiddenTrackedPath(".env.deploy.example"), false);
    assert.equal(isForbiddenTrackedPath(".dev.vars.example"), false);
  });

  it("rejects local-only and build artifact paths", () => {
    assert.equal(isForbiddenTrackedPath(".dev.vars"), true);
    assert.equal(isForbiddenTrackedPath(".env.deploy.local"), true);
    assert.equal(isForbiddenTrackedPath(".env"), true);
    assert.equal(isForbiddenTrackedPath(".wrangler/state.json"), true);
    assert.equal(isForbiddenTrackedPath("node_modules/pkg/index.js"), true);
    assert.equal(isForbiddenTrackedPath("dist/index.js"), true);
    assert.equal(isForbiddenTrackedPath("coverage/lcov.info"), true);
    assert.equal(isForbiddenTrackedPath("package-lock.json"), true);
    assert.equal(isForbiddenTrackedPath(".cursor/rules/foo.md"), true);
    assert.equal(isForbiddenTrackedPath(".opencode/config.json"), true);
  });

  it("rejects tracked .env variants except allowlist", () => {
    assert.equal(isForbiddenTrackedPath(".env.local"), true);
    assert.equal(isForbiddenTrackedPath("subdir/.env.production"), true);
  });
});

describe("isPlaceholderValue", () => {
  it("accepts empty and documented placeholders", () => {
    assert.equal(isPlaceholderValue(""), true);
    assert.equal(isPlaceholderValue("https://<your-worker-host>"), true);
    assert.equal(isPlaceholderValue("<your-auth0-tenant>.us.auth0.com"), true);
    assert.equal(isPlaceholderValue("<your-kv-namespace-id>"), true);
    assert.equal(isPlaceholderValue("https://chatgpt.com/connector/oauth/{callback_id}"), true);
    assert.equal(isPlaceholderValue('"AKIA..."'), true);
    assert.equal(isPlaceholderValue('"..."'), true);
  });

  it("rejects real-looking values", () => {
    assert.equal(isPlaceholderValue("super-secret-token-value"), false);
    assert.equal(isPlaceholderValue("AKIAIOSFODNN7EXAMPLE"), false);
  });
});

describe("scanLineForSecrets", () => {
  it("flags real AWS access key values", () => {
    const violations = scanLineForSecrets("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
    assert.ok(violations.length >= 1);
    assert.ok(violations.every((v) => v.ruleId === "secret-like-value"));
  });

  it("does not flag test fixtures or empty assignments", () => {
    assert.equal(scanLineForSecrets('accessKeyId: "AKIA-test"').length, 0);
    assert.equal(scanLineForSecrets("MCP_AUTH_TOKEN=").length, 0);
    assert.equal(scanLineForSecrets("AWS_MCP_GATEWAY_MCP_AUTH_TOKEN=").length, 0);
  });

  it("flags private key headers", () => {
    const violations = scanLineForSecrets("-----BEGIN RSA PRIVATE KEY-----");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "secret-like-value");
  });

  it("flags non-empty sensitive env assignments", () => {
    const violations = scanLineForSecrets("MCP_AUTH_TOKEN=live-token-value");
    assert.equal(violations.length, 1);
  });
});

describe("checkMaintainerDenylist", () => {
  it("flags known maintainer deployment defaults", () => {
    const content = 'MCP_RESOURCE_URL=https://aws-mcp-gateway.rafaondjango.workers.dev';
    const violations = checkMaintainerDenylist(content, "wrangler.jsonc");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "maintainer-default");
  });

  it("allows sanitized placeholder config", () => {
    const content = '"MCP_RESOURCE_URL": "https://<your-worker-host>"';
    const violations = checkMaintainerDenylist(content, "wrangler.jsonc");
    assert.equal(violations.length, 0);
  });
});

describe("checkPublicConfigFile", () => {
  it("allows placeholder wrangler deploy values", () => {
    const content = `
      "MCP_RESOURCE_URL": "https://<your-worker-host>",
      "OAUTH_ISSUER": "https://<your-auth0-tenant>/",
      "id": "<your-kv-namespace-id>",
    `;
    const violations = checkPublicConfigFile(content, "wrangler.jsonc", { mode: "wrangler" });
    assert.equal(violations.length, 0);
  });

  it("flags live wrangler oauth values", () => {
    const content = '"MCP_RESOURCE_URL": "https://my-live-worker.example.com"';
    const violations = checkPublicConfigFile(content, "wrangler.jsonc", { mode: "wrangler" });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].ruleId, "public-config-unsafe");
  });
});

describe("formatViolation", () => {
  it("never includes secret substrings from scanned content", () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const formatted = formatViolation({
      file: "bad.env",
      line: 4,
      ruleId: "secret-like-value",
    });
    assert.equal(formatted, "bad.env:4: secret-like-value");
    assert.doesNotMatch(formatted, new RegExp(secret));
  });
});

describe("runRepositorySafetyChecks", () => {
  it("reports forbidden tracked paths without reading file contents", () => {
    const violations = runRepositorySafetyChecks([".dev.vars"], () => {
      throw new Error("should not read forbidden files");
    });
    assert.deepEqual(violations, [
      { file: ".dev.vars", line: 0, ruleId: "forbidden-tracked-path" },
    ]);
  });

  it("aggregates checks across tracked files", () => {
    const files = {
      "README.md": "# docs only",
      ".env.deploy.example": "AWS_MCP_GATEWAY_MCP_AUTH_TOKEN=\n",
      "wrangler.jsonc": '"MCP_RESOURCE_URL": "https://<your-worker-host>"',
    };
    const violations = runRepositorySafetyChecks(Object.keys(files), (path) => files[path] ?? null);
    assert.equal(violations.length, 0);
  });
});

describe("checkTrackedFile", () => {
  it("flags accidentally tracked local env assignments", () => {
    const violations = checkTrackedFile(
      ".dev.vars",
      "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nMCP_AUTH_TOKEN=secret\n",
    );
    assert.ok(violations.some((v) => v.ruleId === "forbidden-tracked-path"));
  });
});
