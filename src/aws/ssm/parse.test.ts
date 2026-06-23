import { describe, it, expect } from "vitest";
import {
  buildMissingParameterEntry,
  detectSuspiciousMetadata,
  normalizeParameterMetadata,
} from "./parse.js";

describe("detectSuspiciousMetadata", () => {
  it("flags placeholder descriptions", () => {
    expect(detectSuspiciousMetadata("TODO replace me")).toBe(true);
    expect(detectSuspiciousMetadata("Production database host")).toBe(false);
  });
});

describe("normalizeParameterMetadata", () => {
  it("returns only safe metadata fields and never Value", () => {
    const entry = normalizeParameterMetadata(
      {
        Name: "/app/prod/db/host",
        Type: "SecureString",
        Version: 3,
        LastModifiedDate: 1_718_000_000_000,
        KeyId: "alias/aws/ssm",
        Description: "Database hostname",
        Value: "super-secret-host",
      },
      "db/host",
    );

    expect(entry).toEqual({
      name: "db/host",
      path: "/app/prod/db/host",
      exists: true,
      type: "SecureString",
      version: 3,
      lastModifiedDate: new Date(1_718_000_000_000).toISOString(),
      keyId: "alias/aws/ssm",
    });
    expect(entry).not.toHaveProperty("value");
    expect(entry).not.toHaveProperty("Value");
    expect(JSON.stringify(entry)).not.toContain("super-secret-host");
  });

  it("marks suspicious metadata from description", () => {
    const entry = normalizeParameterMetadata(
      {
        Name: "/app/prod/api/key",
        Type: "String",
        Description: "placeholder value",
      },
      "api/key",
    );

    expect(entry.suspiciousMetadata).toBe(true);
  });
});

describe("buildMissingParameterEntry", () => {
  it("returns exists false without metadata", () => {
    expect(buildMissingParameterEntry("missing", "/app/prod/missing")).toEqual({
      name: "missing",
      path: "/app/prod/missing",
      exists: false,
    });
  });
});
