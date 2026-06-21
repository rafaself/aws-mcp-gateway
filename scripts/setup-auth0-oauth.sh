#!/usr/bin/env bash
# Configure Auth0 API + ChatGPT OAuth application for aws-mcp-gateway.
# Requires a Machine-to-Machine app authorized for the Auth0 Management API.
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

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name in $ENV_FILE" >&2
    exit 1
  fi
}

require_var AWS_MCP_GATEWAY_AUTH0_DOMAIN
require_var AWS_MCP_GATEWAY_AUTH0_MGMT_CLIENT_ID
require_var AWS_MCP_GATEWAY_AUTH0_MGMT_CLIENT_SECRET

AUTH0_DOMAIN="${AWS_MCP_GATEWAY_AUTH0_DOMAIN}"
WORKER_URL="${AWS_MCP_GATEWAY_WORKER_URL:-https://aws-mcp-gateway.rafaondjango.workers.dev}"
CHATGPT_CALLBACK="${AWS_MCP_GATEWAY_CHATGPT_REDIRECT_URI:-}"
API_NAME="${AWS_MCP_GATEWAY_AUTH0_API_NAME:-aws-mcp-gateway}"
APP_NAME="${AWS_MCP_GATEWAY_AUTH0_APP_NAME:-aws-mcp-gateway-chatgpt}"

mgmt_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  local args=(-sS -X "$method" "https://${AUTH0_DOMAIN}/api/v2${path}")
  args+=(-H "Authorization: Bearer ${MGMT_TOKEN}")
  args+=(-H "Content-Type: application/json")

  if [[ -n "$data" ]]; then
    args+=(-d "$data")
  fi

  curl "${args[@]}"
}

echo "Requesting Auth0 Management API token..."
MGMT_TOKEN="$(
  curl -sS -X POST "https://${AUTH0_DOMAIN}/oauth/token" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg client_id "$AWS_MCP_GATEWAY_AUTH0_MGMT_CLIENT_ID" \
      --arg client_secret "$AWS_MCP_GATEWAY_AUTH0_MGMT_CLIENT_SECRET" \
      --arg audience "https://${AUTH0_DOMAIN}/api/v2/" \
      '{
        client_id: $client_id,
        client_secret: $client_secret,
        audience: $audience,
        grant_type: "client_credentials"
      }')" | jq -r '.access_token // empty'
)"

if [[ -z "$MGMT_TOKEN" ]]; then
  echo "Failed to obtain Management API token. Check Auth0 M2M client credentials." >&2
  exit 1
fi

echo "Ensuring resource server (audience=${WORKER_URL})..."
EXISTING_API="$(mgmt_api GET "/resource-servers" | jq -r --arg aud "$WORKER_URL" '.[] | select(.identifier == $aud) | .id' | head -1)"

API_PAYLOAD="$(jq -n \
  --arg name "$API_NAME" \
  --arg identifier "$WORKER_URL" \
  '{
    name: $name,
    identifier: $identifier,
    signing_alg: "RS256",
    token_lifetime: 86400,
    enforce_policies: true,
    token_dialect: "access_token_authz",
    scopes: [{ value: "aws:read", description: "Read-only AWS MCP tools" }]
  }')"

if [[ -n "$EXISTING_API" ]]; then
  echo "Updating existing API ${EXISTING_API}..."
  mgmt_api PATCH "/resource-servers/${EXISTING_API}" "$API_PAYLOAD" | jq '{id, identifier, scopes}'
else
  echo "Creating API..."
  EXISTING_API="$(mgmt_api POST "/resource-servers" "$API_PAYLOAD" | jq -r '.id')"
  echo "Created API id=${EXISTING_API}"
fi

echo "Ensuring ChatGPT OAuth application (${APP_NAME})..."
EXISTING_CLIENT="$(mgmt_api GET "/clients?fields=client_id,name&include_fields=true&per_page=100" | jq -r --arg name "$APP_NAME" '.[] | select(.name == $name) | .client_id' | head -1)"

CLIENT_PAYLOAD="$(jq -n \
  --arg name "$APP_NAME" \
  --arg callback "$CHATGPT_CALLBACK" \
  '{
    name: $name,
    app_type: "regular_web",
    oidc_conformant: true,
    grant_types: ["authorization_code", "refresh_token"],
    is_first_party: true,
    callbacks: (if $callback == "" then [] else [$callback] end),
    allowed_logout_urls: [],
    jwt_configuration: { alg: "RS256" }
  }')"

if [[ -n "$EXISTING_CLIENT" ]]; then
  echo "Updating existing client ${EXISTING_CLIENT}..."
  if [[ -n "$CHATGPT_CALLBACK" ]]; then
    mgmt_api PATCH "/clients/${EXISTING_CLIENT}" "$CLIENT_PAYLOAD" | jq '{client_id, name, callbacks}'
  else
    echo "No AWS_MCP_GATEWAY_CHATGPT_REDIRECT_URI set — skipping callback update."
    echo "Add https://chatgpt.com/connector/oauth/{callback_id} in Auth0 dashboard when creating the ChatGPT connector."
  fi
  CLIENT_ID="$EXISTING_CLIENT"
else
  echo "Creating client..."
  CLIENT_ID="$(mgmt_api POST "/clients" "$CLIENT_PAYLOAD" | jq -r '.client_id')"
  echo "Created client_id=${CLIENT_ID}"
  if [[ -z "$CHATGPT_CALLBACK" ]]; then
    echo "Add ChatGPT redirect URI in Auth0 dashboard: https://chatgpt.com/connector/oauth/{callback_id}"
  fi
fi

echo "Ensuring client grant for aws:read..."
EXISTING_GRANT="$(mgmt_api GET "/client-grants?client_id=${CLIENT_ID}" | jq -r --arg aud "$WORKER_URL" '.[] | select(.audience == $aud) | .id' | head -1)"

GRANT_PAYLOAD="$(jq -n \
  --arg client_id "$CLIENT_ID" \
  --arg audience "$WORKER_URL" \
  '{
    client_id: $client_id,
    audience: $audience,
    scope: ["aws:read"]
  }')"

if [[ -n "$EXISTING_GRANT" ]]; then
  mgmt_api PATCH "/client-grants/${EXISTING_GRANT}" "$(jq -n '{scope: ["aws:read"]}')" | jq '{id, audience, scope}'
else
  mgmt_api POST "/client-grants" "$GRANT_PAYLOAD" | jq '{id, audience, scope}'
fi

echo ""
echo "Auth0 OAuth setup complete."
echo "  API audience: ${WORKER_URL}"
echo "  ChatGPT client_id: ${CLIENT_ID}"
echo "  Issuer (use in wrangler): https://${AUTH0_DOMAIN%/}/"
echo ""
echo "Validate JWKS:"
echo "  curl -fsS https://${AUTH0_DOMAIN}/.well-known/jwks.json | jq '.keys | length'"
