#!/usr/bin/env bash
# Resolve the gitignored Wrangler deploy config used by deploy and sync scripts.
# Tracked wrangler.jsonc must keep placeholders for repo:safety.

resolve_wrangler_deploy_config() {
  local root="$1"
  WRANGLER_DEPLOY_CONFIG="${WRANGLER_CONFIG:-$root/wrangler.deploy.jsonc}"

  if [[ ! -f "$WRANGLER_DEPLOY_CONFIG" ]]; then
    echo "Missing Wrangler deploy config: $WRANGLER_DEPLOY_CONFIG" >&2
    echo "Copy wrangler.deploy.example.jsonc to wrangler.deploy.jsonc and fill deployment values." >&2
    echo "Keep wrangler.jsonc placeholders-only in Git (see docs/deployment.md)." >&2
    return 1
  fi

  WRANGLER_CONFIG_ARGS=(--config "$WRANGLER_DEPLOY_CONFIG")
}

# Prefer deploy config for optional cross-checks; fall back to tracked template.
resolve_wrangler_config_for_read() {
  local root="$1"
  local deploy_config="${WRANGLER_CONFIG:-$root/wrangler.deploy.jsonc}"

  if [[ -f "$deploy_config" ]]; then
    WRANGLER_CONFIG_FOR_READ="$deploy_config"
    return 0
  fi

  WRANGLER_CONFIG_FOR_READ="$root/wrangler.jsonc"
}
