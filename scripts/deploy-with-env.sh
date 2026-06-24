#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${1:-$ROOT/.env.deploy.local}"
# shellcheck source=lib/wrangler-deploy-config.sh
source "$ROOT/scripts/lib/wrangler-deploy-config.sh"

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

resolve_wrangler_deploy_config "$ROOT"

cd "$ROOT"
pnpm exec wrangler deploy "${WRANGLER_CONFIG_ARGS[@]}"
