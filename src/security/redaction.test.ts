import { describe, it, expect } from "vitest";
import { redactSensitiveText } from "./redaction.js";

describe("redactSensitiveText", () => {
  it("redacts Bearer tokens", () => {
    const input = "Auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig";
    expect(redactSensitiveText(input)).toBe("Auth failed: Bearer [REDACTED]");
  });

  it("redacts Authorization headers", () => {
    const input = "Request failed Authorization: Basic dXNlcjpwYXNz";
    expect(redactSensitiveText(input)).toBe("Request failed Authorization: [REDACTED]");
  });

  it("redacts key=value secret patterns case-insensitively", () => {
    expect(redactSensitiveText("password=supersecret")).toBe("password=[REDACTED]");
    expect(redactSensitiveText("API_KEY=abc123")).toBe("API_KEY=[REDACTED]");
    expect(redactSensitiveText("token=my-token-value")).toBe("token=[REDACTED]");
  });

  it("redacts AWS access key-like strings", () => {
    expect(redactSensitiveText("key=AKIAIOSFODNN7EXAMPLE")).toBe("key=[REDACTED]");
    expect(redactSensitiveText("using ASIAIOSFODNN7EXAMPLE")).toBe("using [REDACTED]");
  });

  it("redacts connection strings", () => {
    expect(redactSensitiveText("db=postgres://user:pass@host:5432/db")).toBe(
      "db=postgres://[REDACTED]",
    );
    expect(redactSensitiveText("redis://:secret@localhost:6379")).toBe("redis://[REDACTED]");
  });

  it("redacts PEM private key blocks", () => {
    const input = `header\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nfooter`;
    const result = redactSensitiveText(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("MIIEowIBAAKCAQEA");
  });

  it("leaves benign text unchanged", () => {
    const input = "INFO: request completed status=200 duration=12ms";
    expect(redactSensitiveText(input)).toBe(input);
  });
});
