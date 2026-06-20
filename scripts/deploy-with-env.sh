#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.deploy.local}"

"$ROOT/scripts/sync-secrets.sh" "$ENV_FILE"

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

cd "$ROOT"
pnpm exec wrangler deploy
