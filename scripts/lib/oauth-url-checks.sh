#!/usr/bin/env bash
# Shared OAuth origin URL checks for setup and deployment verification scripts.

oauth_url_fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Strip trailing slash from an HTTPS origin URL.
normalize_oauth_origin_url() {
  local url="${1%/}"
  echo "$url"
}

reject_placeholder_oauth_url() {
  local label="${1:?label required}"
  local value="${2:?value required}"
  if [[ "$value" == *"<your-"* ]]; then
    oauth_url_fail "${label} still contains a placeholder — replace it with your deployment value"
  fi
}

# Validate an HTTPS origin URL suitable for MCP_RESOURCE_URL / OAUTH_AUDIENCE.
# Rejects paths (including /mcp), query strings, and fragments.
validate_oauth_origin_url() {
  local label="${1:?label required}"
  local url="${2:?url required}"
  url="$(normalize_oauth_origin_url "$url")"
  reject_placeholder_oauth_url "$label" "$url"

  if [[ ! "$url" =~ ^https://[^/]+$ ]]; then
    if [[ "$url" =~ ^http:// ]]; then
      oauth_url_fail "${label} must be an https URL (got: ${url})"
    fi
    if [[ "$url" == */mcp ]]; then
      oauth_url_fail "${label} must not include /mcp — use the Worker origin only (got: ${url})"
    fi
    if [[ "$url" == *\?* ]] || [[ "$url" == *#* ]]; then
      oauth_url_fail "${label} must not include query or fragment (got: ${url})"
    fi
    if [[ "$url" == */* ]]; then
      oauth_url_fail "${label} must not include a path (got: ${url})"
    fi
    oauth_url_fail "${label} must be an https origin URL without path, query, or fragment (got: ${url})"
  fi

  echo "$url"
}

assert_audience_matches_resource() {
  local resource="${1:?resource required}"
  local audience="${2:?audience required}"
  resource="$(normalize_oauth_origin_url "$resource")"
  audience="$(normalize_oauth_origin_url "$audience")"

  if [[ "$resource" != "$audience" ]]; then
    oauth_url_fail "OAUTH_AUDIENCE must equal MCP_RESOURCE_URL (resource=${resource}, audience=${audience})"
  fi
}

print_chatgpt_connector_url() {
  local origin
  origin="$(normalize_oauth_origin_url "${1:?origin required}")"
  echo "ChatGPT Connector Server URL: ${origin}/mcp"
}
