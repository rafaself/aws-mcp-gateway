#!/usr/bin/env bash
# Verify deployed OAuth metadata, WWW-Authenticate challenge, and optional JWKS.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/oauth-url-checks.sh
source "${SCRIPT_DIR}/lib/oauth-url-checks.sh"

ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKER_URL="${1:-${AWS_MCP_GATEWAY_WORKER_URL:-}}"
AUTH0_DOMAIN="${2:-${AWS_MCP_GATEWAY_AUTH0_DOMAIN:-}}"
# shellcheck source=lib/wrangler-deploy-config.sh
source "${SCRIPT_DIR}/lib/wrangler-deploy-config.sh"
resolve_wrangler_config_for_read "$ROOT"
WRANGLER_FILE="$WRANGLER_CONFIG_FOR_READ"

if [[ -z "$WORKER_URL" || -z "$AUTH0_DOMAIN" ]]; then
  echo "Missing deployment targets." >&2
  echo "" >&2
  echo "Usage: verify-oauth-deployment.sh <worker-url> <auth0-domain>" >&2
  echo "  or set AWS_MCP_GATEWAY_WORKER_URL and AWS_MCP_GATEWAY_AUTH0_DOMAIN" >&2
  echo "" >&2
  echo "Example:" >&2
  echo "  bash scripts/verify-oauth-deployment.sh https://<worker-host> <auth0-tenant>.us.auth0.com" >&2
  echo "  source .env.deploy.local && pnpm run verify:oauth" >&2
  exit 1
fi

WORKER_URL="$(validate_oauth_origin_url "WORKER_URL" "$WORKER_URL")"

if [[ "$AUTH0_DOMAIN" == *"<your-"* ]]; then
  oauth_url_fail "AUTH0_DOMAIN still contains a placeholder — replace it with your Auth0 tenant domain"
fi

if [[ -f "$WRANGLER_FILE" ]] && command -v jq >/dev/null 2>&1; then
  MCP_RESOURCE_URL="$(jq -r '.vars.MCP_RESOURCE_URL // empty' "$WRANGLER_FILE")"
  OAUTH_AUDIENCE="$(jq -r '.vars.OAUTH_AUDIENCE // empty' "$WRANGLER_FILE")"

  if [[ -n "$MCP_RESOURCE_URL" && "$MCP_RESOURCE_URL" != "https://<your-worker-host>" ]]; then
    MCP_RESOURCE_URL="$(validate_oauth_origin_url "MCP_RESOURCE_URL (${WRANGLER_FILE})" "$MCP_RESOURCE_URL")"
    if [[ "$MCP_RESOURCE_URL" != "$WORKER_URL" ]]; then
      oauth_url_fail "${WRANGLER_FILE} MCP_RESOURCE_URL (${MCP_RESOURCE_URL}) does not match WORKER_URL (${WORKER_URL})"
    fi
  fi

  if [[ -n "$OAUTH_AUDIENCE" && "$OAUTH_AUDIENCE" != "https://<your-worker-host>" ]]; then
    OAUTH_AUDIENCE="$(validate_oauth_origin_url "OAUTH_AUDIENCE (${WRANGLER_FILE})" "$OAUTH_AUDIENCE")"
    if [[ -n "$MCP_RESOURCE_URL" && "$MCP_RESOURCE_URL" != "https://<your-worker-host>" ]]; then
      assert_audience_matches_resource "$MCP_RESOURCE_URL" "$OAUTH_AUDIENCE"
    elif [[ "$OAUTH_AUDIENCE" != "$WORKER_URL" ]]; then
      oauth_url_fail "${WRANGLER_FILE} OAUTH_AUDIENCE (${OAUTH_AUDIENCE}) does not match WORKER_URL (${WORKER_URL})"
    fi
  fi
fi

pass() {
  echo "PASS: $*"
}

echo "OAuth URL model:"
print_chatgpt_connector_url "$WORKER_URL"
echo "  MCP_RESOURCE_URL / OAUTH_AUDIENCE: ${WORKER_URL}"
echo "  Protected resource metadata: ${WORKER_URL}/.well-known/oauth-protected-resource"
echo ""

echo "Checking JWKS at https://${AUTH0_DOMAIN}/.well-known/jwks.json ..."
JWKS_COUNT="$(curl -fsS "https://${AUTH0_DOMAIN}/.well-known/jwks.json" | jq '.keys | length')"
[[ "$JWKS_COUNT" -ge 1 ]] || oauth_url_fail "JWKS has no keys"
pass "JWKS reachable (${JWKS_COUNT} keys)"

echo "Checking protected resource metadata ..."
METADATA="$(curl -fsS "${WORKER_URL}/.well-known/oauth-protected-resource")"
echo "$METADATA" | jq .

RESOURCE="$(echo "$METADATA" | jq -r '.resource')"
[[ "$RESOURCE" == "$WORKER_URL" ]] || oauth_url_fail "resource mismatch: ${RESOURCE}"
pass "resource matches worker URL"

echo "$METADATA" | jq -e '.scopes_supported | index("aws:read")' >/dev/null \
  || oauth_url_fail "scopes_supported missing aws:read"
pass "scopes_supported includes aws:read"

echo "$METADATA" | jq -e '.authorization_servers | length > 0' >/dev/null \
  || oauth_url_fail "authorization_servers empty"
pass "authorization_servers present"

echo "Checking /mcp WWW-Authenticate challenge ..."
HEADERS="$(curl -si -X POST "${WORKER_URL}/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"

echo "$HEADERS" | head -20

echo "$HEADERS" | grep -qi '^HTTP/.* 401' || oauth_url_fail "expected HTTP 401"
pass "unauthenticated /mcp returns 401"

echo "$HEADERS" | grep -qi 'www-authenticate:.*resource_metadata=' \
  || oauth_url_fail "WWW-Authenticate missing resource_metadata"
pass "WWW-Authenticate includes resource_metadata"

echo "$HEADERS" | grep -qi 'scope="aws:read"' \
  || oauth_url_fail "WWW-Authenticate missing aws:read scope"
pass "WWW-Authenticate includes aws:read scope"

echo ""
echo "All automated OAuth deployment checks passed."
