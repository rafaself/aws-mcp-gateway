#!/usr/bin/env bash
# Verify authenticated MCP behavior against a deployed Worker using either a
# pre-issued access token or an OAuth client-credentials smoke client.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/oauth-token-errors.sh
source "${SCRIPT_DIR}/lib/oauth-token-errors.sh"
WRANGLER_FILE="${ROOT}/wrangler.jsonc"
WORKER_URL="${1:-${AWS_MCP_GATEWAY_WORKER_URL:-}}"

if [[ -z "$WORKER_URL" ]]; then
  if [[ -f "$WRANGLER_FILE" ]] && command -v jq >/dev/null 2>&1; then
    WORKER_URL="$(jq -r '.vars.MCP_RESOURCE_URL // empty' "$WRANGLER_FILE")"
  fi
fi

if [[ -z "$WORKER_URL" ]]; then
  echo "Missing worker URL. Pass it as the first argument or set AWS_MCP_GATEWAY_WORKER_URL." >&2
  exit 1
fi

WORKER_URL="${WORKER_URL%/}"
MCP_URL="${WORKER_URL}/mcp"
ACCESS_TOKEN="${AWS_MCP_GATEWAY_ACCESS_TOKEN:-}"

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing $name" >&2
    exit 1
  fi
}

MCP_LAST_RESPONSE=""
MCP_LAST_HEADERS_FILE=""
MCP_LAST_BODY_FILE=""

json_rpc() {
  local payload="$1"
  local headers_file
  local body_file
  local content_type

  headers_file="$(mktemp)"
  body_file="$(mktemp)"

  curl -fsS -D "$headers_file" -o "$body_file" -X POST "$MCP_URL" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Accept: application/json, text/event-stream" \
    -H "Content-Type: application/json" \
    ${MCP_PROTOCOL_VERSION:+-H "mcp-protocol-version: ${MCP_PROTOCOL_VERSION}"} \
    ${MCP_SESSION_ID:+-H "mcp-session-id: ${MCP_SESSION_ID}"} \
    -d "$payload"

  MCP_LAST_HEADERS_FILE="$headers_file"
  MCP_LAST_BODY_FILE="$body_file"

  content_type="$(
    awk 'BEGIN { IGNORECASE = 1 } /^content-type:/ { print $2; exit }' "$headers_file" \
      | tr -d '\r'
  )"

  if [[ "$content_type" == *"text/event-stream"* ]]; then
    MCP_LAST_RESPONSE="$(
      awk '
        /^data: / {
          sub(/^data: /, "", $0)
          print
        }
      ' "$body_file" | tail -n 1
    )"
  else
    MCP_LAST_RESPONSE="$(cat "$body_file")"
  fi
}

cleanup_json_rpc_temp_files() {
  if [[ -n "${MCP_LAST_HEADERS_FILE:-}" ]]; then
    rm -f "$MCP_LAST_HEADERS_FILE"
    MCP_LAST_HEADERS_FILE=""
  fi
  if [[ -n "${MCP_LAST_BODY_FILE:-}" ]]; then
    rm -f "$MCP_LAST_BODY_FILE"
    MCP_LAST_BODY_FILE=""
  fi
}

smoke_quiet() {
  [[ "${AWS_MCP_GATEWAY_SMOKE_QUIET:-}" == "1" || "${GITHUB_ACTIONS:-}" == "true" ]]
}

print_smoke_response() {
  local response="$1"
  if smoke_quiet; then
    echo "  ok"
  else
    echo "$response" | jq .
  fi
}

if [[ -z "$ACCESS_TOKEN" ]]; then
  require_var AWS_MCP_GATEWAY_OAUTH_TOKEN_URL
  require_var AWS_MCP_GATEWAY_OAUTH_CLIENT_ID
  require_var AWS_MCP_GATEWAY_OAUTH_CLIENT_SECRET

  AUDIENCE="${AWS_MCP_GATEWAY_OAUTH_AUDIENCE:-$WORKER_URL}"
  SCOPE="${AWS_MCP_GATEWAY_OAUTH_SCOPE:-aws:read}"

  echo "Requesting OAuth smoke access token..."
  TOKEN_RESPONSE="$(
    curl -fsS -X POST "${AWS_MCP_GATEWAY_OAUTH_TOKEN_URL}" \
      -H "Content-Type: application/json" \
      -d "$(jq -n \
        --arg client_id "$AWS_MCP_GATEWAY_OAUTH_CLIENT_ID" \
        --arg client_secret "$AWS_MCP_GATEWAY_OAUTH_CLIENT_SECRET" \
        --arg audience "$AUDIENCE" \
        --arg scope "$SCOPE" \
        '{
          client_id: $client_id,
          client_secret: $client_secret,
          audience: $audience,
          scope: $scope,
          grant_type: "client_credentials"
        }')"
  )"
  ACCESS_TOKEN="$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')"
  if [[ -z "$ACCESS_TOKEN" ]]; then
    print_oauth_token_failure "OAuth smoke access token" "$TOKEN_RESPONSE"
    exit 1
  fi
fi

echo "Checking authenticated initialize ..."
json_rpc '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"deployment-smoke","version":"1.0.0"}}}'
INITIALIZE_RESPONSE="$MCP_LAST_RESPONSE"
MCP_SESSION_ID="$(
  awk 'BEGIN { IGNORECASE = 1 } /^mcp-session-id:/ { print $2; exit }' "$MCP_LAST_HEADERS_FILE" \
    | tr -d '\r'
)"
cleanup_json_rpc_temp_files
if [[ -z "$MCP_SESSION_ID" ]]; then
  echo "Missing mcp-session-id header on initialize response." >&2
  exit 1
fi
MCP_PROTOCOL_VERSION="2024-11-05"
print_smoke_response "$INITIALIZE_RESPONSE"
echo "$INITIALIZE_RESPONSE" | jq -e '.result.serverInfo.name == "aws-mcp-gateway"' >/dev/null

echo "Checking authenticated tools/list ..."
json_rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
TOOLS_LIST_RESPONSE="$MCP_LAST_RESPONSE"
cleanup_json_rpc_temp_files
print_smoke_response "$TOOLS_LIST_RESPONSE"
echo "$TOOLS_LIST_RESPONSE" | jq -e '.result.tools | length == 8' >/dev/null
echo "$TOOLS_LIST_RESPONSE" | jq -e '
  ([.result.tools[].name] | sort) == (
    [
      "search",
      "fetch",
      "get_gateway_status",
      "get_aws_cost_summary",
      "get_aws_cost_by_service",
      "list_ec2_instances",
      "get_cloudwatch_alarms",
      "get_recent_log_errors"
    ] | sort
  )' >/dev/null
echo "$TOOLS_LIST_RESPONSE" | jq -e '
  all(.result.tools[];
    (.securitySchemes | length > 0)
    and (._meta.securitySchemes | length > 0)
    and ((.securitySchemes | map(.type)) | index("noauth") | not)
  )' >/dev/null

echo "Checking get_gateway_status ..."
json_rpc '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_gateway_status","arguments":{}}}'
STATUS_RESPONSE="$MCP_LAST_RESPONSE"
cleanup_json_rpc_temp_files
print_smoke_response "$STATUS_RESPONSE"
echo "$STATUS_RESPONSE" | jq -e '.result.structuredContent.status == "ok"' >/dev/null

echo "Checking search ..."
json_rpc '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search","arguments":{"query":"ec2"}}}'
SEARCH_RESPONSE="$MCP_LAST_RESPONSE"
cleanup_json_rpc_temp_files
print_smoke_response "$SEARCH_RESPONSE"
echo "$SEARCH_RESPONSE" | jq -e '.result.structuredContent.results | length > 0' >/dev/null

echo "Checking fetch ..."
json_rpc '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"fetch","arguments":{"id":"tool/list_ec2_instances"}}}'
FETCH_RESPONSE="$MCP_LAST_RESPONSE"
cleanup_json_rpc_temp_files
print_smoke_response "$FETCH_RESPONSE"
echo "$FETCH_RESPONSE" | jq -e '.result.structuredContent.id == "tool/list_ec2_instances"' >/dev/null

if [[ -n "${AWS_MCP_GATEWAY_SMOKE_REGION:-}" ]]; then
  echo "Checking bounded AWS tool (list_ec2_instances in ${AWS_MCP_GATEWAY_SMOKE_REGION}) ..."
  json_rpc "$(jq -nc \
      --arg region "$AWS_MCP_GATEWAY_SMOKE_REGION" \
      '{
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "list_ec2_instances",
          arguments: { regions: [$region] }
        }
      }')"
  EC2_RESPONSE="$MCP_LAST_RESPONSE"
  cleanup_json_rpc_temp_files
  print_smoke_response "$EC2_RESPONSE"
  echo "$EC2_RESPONSE" | jq -e '
    (.result.structuredContent.count >= 0)
    or (
      (.result.structuredContent.error.code // "") as $code
      | ["validation_error", "configuration_error", "aws_request_failed"]
      | index($code) != null
    )' >/dev/null
fi

echo ""
echo "Authenticated deployment checks passed."
