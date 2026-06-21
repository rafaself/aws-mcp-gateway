#!/usr/bin/env bash
# Verify deployed OAuth metadata, WWW-Authenticate challenge, and optional JWKS.
set -euo pipefail

WORKER_URL="${1:-https://aws-mcp-gateway.rafaondjango.workers.dev}"
AUTH0_DOMAIN="${2:-rafa.auth0.com}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

echo "Checking JWKS at https://${AUTH0_DOMAIN}/.well-known/jwks.json ..."
JWKS_COUNT="$(curl -fsS "https://${AUTH0_DOMAIN}/.well-known/jwks.json" | jq '.keys | length')"
[[ "$JWKS_COUNT" -ge 1 ]] || fail "JWKS has no keys"
pass "JWKS reachable (${JWKS_COUNT} keys)"

echo "Checking protected resource metadata ..."
METADATA="$(curl -fsS "${WORKER_URL}/.well-known/oauth-protected-resource")"
echo "$METADATA" | jq .

RESOURCE="$(echo "$METADATA" | jq -r '.resource')"
[[ "$RESOURCE" == "$WORKER_URL" ]] || fail "resource mismatch: ${RESOURCE}"
pass "resource matches worker URL"

echo "$METADATA" | jq -e '.scopes_supported | index("aws:read")' >/dev/null \
  || fail "scopes_supported missing aws:read"
pass "scopes_supported includes aws:read"

echo "$METADATA" | jq -e '.authorization_servers | length > 0' >/dev/null \
  || fail "authorization_servers empty"
pass "authorization_servers present"

echo "Checking /mcp WWW-Authenticate challenge ..."
HEADERS="$(curl -si -X POST "${WORKER_URL}/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"

echo "$HEADERS" | head -20

echo "$HEADERS" | grep -qi '^HTTP/.* 401' || fail "expected HTTP 401"
pass "unauthenticated /mcp returns 401"

echo "$HEADERS" | grep -qi 'www-authenticate:.*resource_metadata=' \
  || fail "WWW-Authenticate missing resource_metadata"
pass "WWW-Authenticate includes resource_metadata"

echo "$HEADERS" | grep -qi 'scope="aws:read"' \
  || fail "WWW-Authenticate missing aws:read scope"
pass "WWW-Authenticate includes aws:read scope"

echo ""
echo "All automated OAuth deployment checks passed."
