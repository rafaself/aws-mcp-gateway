const SESSION_NAME_PREFIX = "aws-mcp-gateway";
const MAX_SESSION_NAME_LENGTH = 64;
const SESSION_NAME_PATTERN = /^[\w+=,.@-]+$/;

export function buildRoleSessionName(roleArn: string, sessionName?: string): string {
  if (sessionName) {
    const trimmed = sessionName.trim();
    if (!trimmed || trimmed.length > MAX_SESSION_NAME_LENGTH || !SESSION_NAME_PATTERN.test(trimmed)) {
      throw new Error("Invalid role session name.");
    }
    return trimmed;
  }

  const suffix = shortHash(roleArn);
  const base = `${SESSION_NAME_PREFIX}-${suffix}`;
  return base.slice(0, MAX_SESSION_NAME_LENGTH);
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(7, "0").slice(0, 7);
}
