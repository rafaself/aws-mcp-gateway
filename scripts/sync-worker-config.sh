#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.deploy.local}"
TAG="${WRANGLER_CONFIG_SYNC_TAG:-config-sync}"
MESSAGE="${WRANGLER_CONFIG_SYNC_MESSAGE:-sync worker secrets and vars}"

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

AUTH_MODE="${AWS_MCP_GATEWAY_AUTH_MODE:-local-bearer}"

SECRETS_FILE="$(mktemp)"
cleanup() {
  rm -f "$SECRETS_FILE"
}
trap cleanup EXIT

if [[ "$AUTH_MODE" == "oauth" ]]; then
  jq -n \
    --arg aws_access_key_id "$AWS_MCP_GATEWAY_AWS_ACCESS_KEY_ID" \
    --arg aws_secret_access_key "$AWS_MCP_GATEWAY_AWS_SECRET_ACCESS_KEY" \
    '{
      AWS_ACCESS_KEY_ID: $aws_access_key_id,
      AWS_SECRET_ACCESS_KEY: $aws_secret_access_key
    }' >"$SECRETS_FILE"
  echo "AUTH_MODE=oauth — MCP_AUTH_TOKEN omitted from version secrets."
else
  require_var AWS_MCP_GATEWAY_MCP_AUTH_TOKEN
  jq -n \
    --arg aws_access_key_id "$AWS_MCP_GATEWAY_AWS_ACCESS_KEY_ID" \
    --arg aws_secret_access_key "$AWS_MCP_GATEWAY_AWS_SECRET_ACCESS_KEY" \
    --arg mcp_auth_token "$AWS_MCP_GATEWAY_MCP_AUTH_TOKEN" \
    '{
      AWS_ACCESS_KEY_ID: $aws_access_key_id,
      AWS_SECRET_ACCESS_KEY: $aws_secret_access_key,
      MCP_AUTH_TOKEN: $mcp_auth_token
    }' >"$SECRETS_FILE"
fi

cd "$ROOT"

echo "Uploading Worker version with vars from wrangler.jsonc and secrets from $ENV_FILE..."
pnpm exec wrangler versions upload \
  --tag "$TAG" \
  --message "$MESSAGE" \
  --secrets-file "$SECRETS_FILE"

echo "Rolling out version tag ${TAG} at 100% (no wrangler deploy)..."
pnpm exec wrangler versions deploy "${TAG}@100%" -y --message "$MESSAGE"

echo "Worker config synced for aws-mcp-gateway (tag: ${TAG})."
