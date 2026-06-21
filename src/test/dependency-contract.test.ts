import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

const PINNED_RUNTIME_DEPENDENCIES = [
  "@modelcontextprotocol/sdk",
  "aws4fetch",
  "fast-xml-parser",
  "jose",
  "zod",
] as const;

const RANGE_PREFIX = /^[\^~><=]/;

describe("runtime dependency contract", () => {
  it("pins MCP transport and auth-critical runtime dependencies to exact versions", () => {
    for (const name of PINNED_RUNTIME_DEPENDENCIES) {
      const version = packageJson.dependencies[name];
      expect(version, `${name} must be declared in dependencies`).toBeDefined();
      expect(version, `${name} must not use a semver range`).not.toMatch(RANGE_PREFIX);
    }
  });
});
