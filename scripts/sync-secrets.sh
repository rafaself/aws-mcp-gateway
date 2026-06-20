#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.deploy.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.deploy.example" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -n "${AWS_MCP_GATEWAY_CLOUDFLARE_API_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="$AWS_MCP_GATEWAY_CLOUDFLARE_API_TOKEN"
fi

if [[ -n "${AWS_MCP_GATEWAY_CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  export CLOUDFLARE_ACCOUNT_ID="$AWS_MCP_GATEWAY_CLOUDFLARE_ACCOUNT_ID"
fi

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name in $ENV_FILE" >&2
    exit 1
  fi
}

require_var AWS_MCP_GATEWAY_AWS_ACCESS_KEY_ID
require_var AWS_MCP_GATEWAY_AWS_SECRET_ACCESS_KEY
require_var AWS_MCP_GATEWAY_MCP_AUTH_TOKEN

cd "$ROOT"

put_secret() {
  local binding="$1"
  local value="$2"
  printf '%s' "$value" | pnpm exec wrangler secret put "$binding"
}

put_secret AWS_ACCESS_KEY_ID "$AWS_MCP_GATEWAY_AWS_ACCESS_KEY_ID"
put_secret AWS_SECRET_ACCESS_KEY "$AWS_MCP_GATEWAY_AWS_SECRET_ACCESS_KEY"
put_secret MCP_AUTH_TOKEN "$AWS_MCP_GATEWAY_MCP_AUTH_TOKEN"

echo "Worker secrets synced for aws-mcp-gateway."
