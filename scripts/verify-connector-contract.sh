#!/usr/bin/env bash
# Local ChatGPT Connector contract gate — no live ChatGPT, Auth0, Cloudflare, or AWS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pass() {
  echo "PASS: $*"
}

run_step() {
  echo ""
  echo "==> $1"
  shift
  "$@"
}

echo "ChatGPT Connector local contract verification"
echo "Contract tests included in pnpm test:"
echo "  - src/test/dependency-contract.test.ts (pinned runtime deps)"
echo "  - src/config/oauth-urls.test.ts (OAuth URL origin contract)"
echo "  - src/mcp/tools/manifest-contract.test.ts (manifest completeness, cost-control)"
echo "  - src/mcp/tools/descriptor-contract.test.ts (descriptor shape, security)"
echo "  - src/mcp/tools/policy.test.ts (policy denial before handler/AWS work)"
echo "  - src/mcp/tools/cost-control-policy.test.ts (cost-control metadata and limits)"
echo "  - src/mcp/tools/capability-contract.test.ts (capability/IAM alignment)"
echo "  - src/mcp/tools/capability-matrix.test.ts (generated capability matrix doc)"
echo "  - src/mcp/tools/exposure.test.ts (tool pack and disable exposure)"
echo "  - src/mcp/tools/list-integration.test.ts (HTTP tools/list, 8 public tools)"
echo "  - src/index.oauth.test.ts (/mcp 401 challenge, protected-resource metadata)"
echo ""

run_step "Typecheck" pnpm run typecheck
pass "typecheck"

run_step "Tests (connector contract coverage)" pnpm test
pass "tests"

run_step "Test integrity" pnpm run test:integrity
pass "test integrity"

echo ""
echo "All local connector contract checks passed."
