#!/usr/bin/env bash

print_oauth_token_failure() {
  local label="$1"
  local response="$2"

  echo "Failed to obtain ${label}." >&2
  echo "$response" | jq -r '
    if .error then
      "OAuth error: \(.error)\nDescription: \(.error_description // "none")"
    else
      "Unexpected OAuth response (no access_token)."
    end
  ' >&2
}
