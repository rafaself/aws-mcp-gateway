const REDACTED = "[REDACTED]";

const SECRET_KEY_BASE =
  "password|secret|token|api[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token";

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const AUTHORIZATION_HEADER_PATTERN = /Authorization:\s*[^\s][^\r\n]*/gi;
const JSON_SECRET_PATTERN = new RegExp(
  `"(?:${SECRET_KEY_BASE}|authorization)"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`,
  "gi",
);
const KEY_VALUE_SECRET_PATTERN = new RegExp(
  `\\b(?:${SECRET_KEY_BASE}|x-api-key)(?!Name|Count)\\b\\s*[=:]\\s*[^\\s&;,'"]+`,
  "gi",
);
const AWS_ACCESS_KEY_PATTERN = /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g;
const CONNECTION_STRING_PATTERN =
  /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s]+/gi;
const PEM_BLOCK_PATTERN =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

function redactKeyValueSecret(match: string): string {
  const separatorIndex = match.search(/[=:]/);
  if (separatorIndex === -1) return REDACTED;
  const afterSeparator = match.slice(separatorIndex + 1);
  const leadingSpace = afterSeparator.match(/^\s*/)?.[0] ?? "";
  return `${match.slice(0, separatorIndex + 1)}${leadingSpace}${REDACTED}`;
}

function redactJsonSecret(match: string): string {
  const valueQuoteIndex = match.indexOf('"', match.indexOf(":") + 1);
  if (valueQuoteIndex === -1) return REDACTED;
  return `${match.slice(0, valueQuoteIndex + 1)}${REDACTED}"`;
}

export function redactSensitiveText(text: string): string {
  if (!text) return text;

  return text
    .replace(PEM_BLOCK_PATTERN, REDACTED)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(AUTHORIZATION_HEADER_PATTERN, `Authorization: ${REDACTED}`)
    .replace(JSON_SECRET_PATTERN, redactJsonSecret)
    .replace(KEY_VALUE_SECRET_PATTERN, redactKeyValueSecret)
    .replace(AWS_ACCESS_KEY_PATTERN, REDACTED)
    .replace(CONNECTION_STRING_PATTERN, (match) => {
      const schemeEnd = match.indexOf("://");
      if (schemeEnd === -1) return REDACTED;
      return `${match.slice(0, schemeEnd + 3)}${REDACTED}`;
    });
}
