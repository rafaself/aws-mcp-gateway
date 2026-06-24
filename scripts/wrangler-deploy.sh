#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/wrangler-deploy-config.sh
source "$ROOT/scripts/lib/wrangler-deploy-config.sh"

resolve_wrangler_deploy_config "$ROOT"

cd "$ROOT"
pnpm exec wrangler deploy "${WRANGLER_CONFIG_ARGS[@]}"
