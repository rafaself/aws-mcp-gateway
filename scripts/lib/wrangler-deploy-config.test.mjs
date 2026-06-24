import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

function runResolver(root, env = {}) {
  return spawnSync(
    "bash",
    [
      "-c",
      `source "${ROOT}/lib/wrangler-deploy-config.sh" && resolve_wrangler_deploy_config "${root}" && printf '%s' "$WRANGLER_DEPLOY_CONFIG"`,
    ],
    { env: { ...process.env, ...env }, encoding: "utf8" },
  );
}

describe("wrangler-deploy-config", () => {
  it("fails when deploy config is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "wrangler-config-missing-"));
    const result = runResolver(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing Wrangler deploy config/);
  });

  it("resolves default wrangler.deploy.jsonc path", () => {
    const dir = mkdtempSync(join(tmpdir(), "wrangler-config-ok-"));
    const configPath = join(dir, "wrangler.deploy.jsonc");
    writeFileSync(configPath, "{}");
    const result = runResolver(dir);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, configPath);
  });

  it("honors WRANGLER_CONFIG override", () => {
    const dir = mkdtempSync(join(tmpdir(), "wrangler-config-custom-"));
    const configPath = join(dir, "custom.jsonc");
    writeFileSync(configPath, "{}");
    const result = runResolver(dir, { WRANGLER_CONFIG: configPath });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, configPath);
  });
});
