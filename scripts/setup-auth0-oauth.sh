#!/usr/bin/env bash
# Configure Auth0 API + ChatGPT OAuth application for aws-mcp-gateway.
# Predefined OAuth client (regular web app) only — MVP path. No CIMD automation
# until provider APIs and ChatGPT flows are verified safe. See
# docs/specs/oauth-client-identification.md.
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
APP_NAME="${AWS_MCP_GATEWAY_AUTH0_APP_NAME:-aws-mcp-gateway}"

build_chatgpt_callbacks_json() {
  local primary="${1:-}"
  local extras="${AWS_MCP_GATEWAY_CHATGPT_REDIRECT_URIS:-}"
  local -a urls=()

  if [[ -n "$primary" ]]; then
    urls+=("$primary")
    if [[ "$primary" == *chatgpt.com/connector/oauth/* ]]; then
      urls+=("${primary/chatgpt.com/chat.openai.com}")
      urls+=("https://chatgpt.com/connector_platform_oauth_redirect")
      urls+=("https://chat.openai.com/connector_platform_oauth_redirect")
    fi
  fi

  if [[ -n "$extras" ]]; then
    local part
    IFS=',' read -ra parts <<< "$extras"
    for part in "${parts[@]}"; do
      part="$(echo "$part" | xargs)"
      [[ -n "$part" ]] && urls+=("$part")
    done
  fi

  local -a unique=()
  local url seen
  for url in "${urls[@]}"; do
    seen=false
    for existing in "${unique[@]:-}"; do
      if [[ "$existing" == "$url" ]]; then
        seen=true
        break
      fi
    done
    if [[ "$seen" == false ]]; then
      unique+=("$url")
    fi
  done

  jq -n --argjson callbacks "$(printf '%s\n' "${unique[@]}" | jq -R . | jq -s .)" '$callbacks'
}

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
TOKEN_RESPONSE="$(
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
      }')"
)"
MGMT_TOKEN="$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')"

if [[ -z "$MGMT_TOKEN" ]]; then
  echo "Failed to obtain Management API token." >&2
  echo "$TOKEN_RESPONSE" | jq -r '
    if .error then
      "Auth0 error: \(.error)\nDescription: \(.error_description // "none")"
    else
      "Unexpected Auth0 response (no access_token)."
    end
  ' >&2
  echo "" >&2
  echo "Checklist:" >&2
  echo "  1. Application type must be Machine to Machine (not Regular Web / SPA)." >&2
  echo "  2. Authorize it for 'Auth0 Management API' in the app's APIs tab." >&2
  echo "  3. Copy Client ID and Client Secret from that M2M app (rotate secret if unsure)." >&2
  echo "  4. AWS_MCP_GATEWAY_AUTH0_DOMAIN should match your tenant (currently: ${AUTH0_DOMAIN})." >&2
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

CLIENT_CALLBACKS_JSON="$(build_chatgpt_callbacks_json "$CHATGPT_CALLBACK")"

CLIENT_PAYLOAD="$(jq -n \
  --arg name "$APP_NAME" \
  --argjson callbacks "$CLIENT_CALLBACKS_JSON" \
  '{
    name: $name,
    app_type: "regular_web",
    oidc_conformant: true,
    grant_types: ["authorization_code", "refresh_token", "client_credentials"],
    is_first_party: true,
    callbacks: $callbacks,
    allowed_logout_urls: [],
    token_endpoint_auth_method: "client_secret_basic",
    jwt_configuration: { alg: "RS256" }
  }')"

if [[ -n "$EXISTING_CLIENT" ]]; then
  echo "Updating existing client ${EXISTING_CLIENT}..."
  if [[ "$(echo "$CLIENT_CALLBACKS_JSON" | jq 'length')" -gt 0 ]]; then
    mgmt_api PATCH "/clients/${EXISTING_CLIENT}" "$CLIENT_PAYLOAD" | jq '{client_id, name, app_type, grant_types, callbacks, token_endpoint_auth_method}'
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
echo "  ChatGPT app: ${APP_NAME}"
echo "  ChatGPT client_id: ${CLIENT_ID}"
if [[ -n "$CHATGPT_CALLBACK" ]]; then
  echo "  Callback URLs:"
  echo "$CLIENT_CALLBACKS_JSON" | jq -r '.[]' | sed 's/^/    - /'
else
  echo "  Callback URL: (not set — add AWS_MCP_GATEWAY_CHATGPT_REDIRECT_URI and re-run)"
fi
echo "  Issuer (use in wrangler): https://${AUTH0_DOMAIN%/}/"
echo ""
echo "In Auth0 Dashboard, open application '${APP_NAME}' (client_id used by ChatGPT OAuth)."
echo ""
echo "Validate JWKS:"
echo "  curl -fsS https://${AUTH0_DOMAIN}/.well-known/jwks.json | jq '.keys | length'"
