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
    expect(redactSensitiveText("client_secret=xyz")).toBe("client_secret=[REDACTED]");
    expect(redactSensitiveText("refresh_token=rt-123")).toBe("refresh_token=[REDACTED]");
  });

  it("redacts colon-separated secret patterns", () => {
    expect(redactSensitiveText("password: abc")).toBe("password: [REDACTED]");
    expect(redactSensitiveText("x-api-key: abc")).toBe("x-api-key: [REDACTED]");
    expect(redactSensitiveText("client_secret: xyz")).toBe("client_secret: [REDACTED]");
    expect(redactSensitiveText("refresh_token: rt-123")).toBe("refresh_token: [REDACTED]");
  });

  it("redacts JSON-style secret values", () => {
    expect(redactSensitiveText('{"token":"abc"}')).toBe('{"token":"[REDACTED]"}');
    expect(redactSensitiveText('{"password":"abc"}')).toBe('{"password":"[REDACTED]"}');
    expect(redactSensitiveText('{"apiKey":"abc"}')).toBe('{"apiKey":"[REDACTED]"}');
    expect(redactSensitiveText('{"secret":"abc"}')).toBe('{"secret":"[REDACTED]"}');
    expect(redactSensitiveText('{"authorization":"Bearer abc"}')).toBe(
      '{"authorization":"[REDACTED]"}',
    );
  });

  it("redacts AWS access key-like strings", () => {
    const awsKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
    const sessionKey = ["ASIA", "IOSFODNN7EXAMPLE"].join("");
    expect(redactSensitiveText(`key=${awsKey}`)).toBe("key=[REDACTED]");
    expect(redactSensitiveText(`using ${sessionKey}`)).toBe("using [REDACTED]");
  });

  it("redacts connection strings", () => {
    expect(redactSensitiveText("db=postgres://user:pass@host:5432/db")).toBe(
      "db=postgres://[REDACTED]",
    );
    expect(redactSensitiveText("redis://:secret@localhost:6379")).toBe("redis://[REDACTED]");
  });

  it("redacts PEM private key blocks", () => {
    const privateKeyBegin = ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("");
    const privateKeyEnd = ["-----END RSA ", "PRIVATE KEY-----"].join("");
    const keyMaterial = "MIIEowIBAAKCAQEA";
    const input = `header\n${privateKeyBegin}\n${keyMaterial}\n${privateKeyEnd}\nfooter`;
    const result = redactSensitiveText(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(keyMaterial);
  });

  it("leaves benign text unchanged", () => {
    const input = "INFO: request completed status=200 duration=12ms";
    expect(redactSensitiveText(input)).toBe(input);
  });

  it("does not over-redact resource metadata field names", () => {
    expect(redactSensitiveText("secretName=prod/my-secret")).toBe("secretName=prod/my-secret");
    expect(redactSensitiveText("tokenCount=42")).toBe("tokenCount=42");
    expect(redactSensitiveText('{"secretName":"prod/my-secret"}')).toBe(
      '{"secretName":"prod/my-secret"}',
    );
  });
});
