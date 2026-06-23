const REDACTED = "[REDACTED]";

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const AUTHORIZATION_HEADER_PATTERN = /Authorization:\s*[^\s][^\r\n]*/gi;
const KEY_VALUE_SECRET_PATTERN =
  /\b(?:password|secret|token|api[_-]?key)\s*=\s*[^\s&;,'"]+/gi;
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g;
const CONNECTION_STRING_PATTERN =
  /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+/gi;
const PEM_BLOCK_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

export function redactSensitiveText(text: string): string {
  if (!text) return text;

  return text
    .replace(PEM_BLOCK_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(AUTHORIZATION_HEADER_PATTERN, `Authorization: ${REDACTED}`)
    .replace(KEY_VALUE_SECRET_PATTERN, (match) => {
      const separatorIndex = match.search(/[=:]/);
      if (separatorIndex === -1) return REDACTED;
      return `${match.slice(0, separatorIndex + 1)}${REDACTED}`;
    })
    .replace(AWS_ACCESS_KEY_PATTERN, REDACTED)
    .replace(CONNECTION_STRING_PATTERN, (match) => {
      const schemeEnd = match.indexOf("://");
      if (schemeEnd === -1) return REDACTED;
      return `${match.slice(0, schemeEnd + 3)}${REDACTED}`;
    });
}
