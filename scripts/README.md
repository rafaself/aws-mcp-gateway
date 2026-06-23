# Scripts

## Purpose

This folder contains operational helpers, validation checks, and deployment verification scripts for `aws-mcp-gateway`.

The scripts here fall into four groups:

- Local quality gates for repository, runtime output, and test integrity.
- Deployment helpers for Wrangler and Worker secrets.
- OAuth/Auth0 setup and deployment verification helpers.
- Shared `lib/` helpers used by shell and Node-based scripts.

## Basic information a README should contain

For a folder like this, a useful `README.md` should always include:

- What the folder is for.
- Any prerequisites such as `node`, `pnpm`, `jq`, `curl`, `wrangler`, or required env files.
- How to run the main commands.
- What each file does.
- Which scripts are safe to run locally and which ones affect external systems.
- Any important input files, environment variables, or output expectations.

When adding a new script to this folder, update this README with:

- The script name.
- Its purpose.
- Its required inputs or environment variables.
- Whether it only validates locally or calls external services.

## Prerequisites

Common requirements across these scripts:

- Node.js `>= 22`
- `pnpm`
- `jq`
- `curl`
- `pnpm exec wrangler` for deployment-related scripts
- A local env file such as `.env.deploy.local` for scripts that load deployment secrets or OAuth settings

## Main commands

These are the package scripts that map to this folder:

```bash
pnpm run repo:safety
pnpm run output:guardrail
pnpm run legacy:check
pnpm run test:integrity
pnpm run sync-secrets
pnpm run sync-config
pnpm run deploy:configured
pnpm run setup:auth0
pnpm run verify:oauth
pnpm run verify:oauth:authenticated
pnpm run verify:connector-contract
pnpm run app-profile:validate -- --file examples/app-profiles/example-prod.profile.json
pnpm run app-profile:put -- --file examples/app-profiles/example-prod.profile.json
pnpm run app-profile:list
pnpm run app-profile:delete -- --profile-id example-prod --yes
```

## Validation tiers

**Minimal local loop** (fast iteration during development):

```bash
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

**Full pre-PR / pre-deploy validation** (same gate as [README.md](../README.md#testing) and [docs/deployment.md](../docs/deployment.md)):

```bash
pnpm run repo:safety
pnpm run output:guardrail
pnpm run verify:connector-contract
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

`verify:connector-contract` runs typecheck, unit tests, and test-integrity checks. CI runs `repo:safety`, `output:guardrail`, and `verify:connector-contract` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml); Gitleaks runs in [`.github/workflows/secret-scan.yml`](../.github/workflows/secret-scan.yml).

## File guide

### Top-level scripts

#### `check-repository-safety.mjs`

Runs repository safety checks against tracked files. It detects unsafe tracked paths, secret-like values, and maintainer-specific defaults that must not be committed.

#### `check-runtime-output.mjs`

Scans production source files under `src/` and fails if `console.*` is used outside the approved observability sinks.

#### `check-legacy-symbols.mjs`

Scans production source files under `src/` and fails if removed legacy auth modes, tool-definition factories, or manifest bridge helpers are reintroduced.

#### `check-test-integrity.mjs`

Scans test files for forbidden `.only()` markers and skipped tests without an `intentional-skip:` justification.

#### `deploy-with-env.sh`

Loads a deployment env file, syncs Worker secrets first, maps Cloudflare credentials into the expected environment variables, and runs `wrangler deploy`.

#### `setup-auth0-oauth.sh`

Configures the Auth0 side of the OAuth flow for this gateway. It obtains a Management API token, ensures the Auth0 API/resource server exists, ensures the ChatGPT OAuth client exists, and grants the `aws:read` scope.

This script calls external services and changes Auth0 configuration.

#### `sync-secrets.sh`

Reads deployment secrets from the env file and pushes them to the Worker with `wrangler secret put`. In OAuth mode it skips syncing `MCP_AUTH_TOKEN`.

This script calls external services and changes Worker secrets.

#### `sync-worker-config.sh`

Uploads a new Worker version with `wrangler versions upload` (vars from `wrangler.jsonc`, secrets from the env file via `--secrets-file`) and rolls it out with `wrangler versions deploy` at 100%. Use this to refresh configuration without `wrangler deploy` (no code release workflow).

Optional environment overrides:

- `WRANGLER_CONFIG_SYNC_TAG` (default: `config-sync`)
- `WRANGLER_CONFIG_SYNC_MESSAGE` (default: `sync worker secrets and vars`)

This script calls external services and changes Worker configuration.

#### `verify-authenticated-deployment.sh`

Runs an authenticated smoke test against a deployed Worker. It can use either a pre-issued access token or obtain one through an OAuth client-credentials flow, then verifies MCP initialization, tool listing, and a small set of tool calls.

This script calls the deployed Worker and may call the OAuth provider.

#### `verify-connector-contract.sh`

Runs the local contract gate for the ChatGPT connector integration. It executes typecheck, tests, and test-integrity checks without depending on live ChatGPT, Auth0, Cloudflare, or AWS services.

### `app-profiles/` CLI scripts

#### `app-profiles/validate-profile.ts`

Validates a local profile JSON file against the Worker schema. Prints metadata-only results. Local-only; does not call KV.

#### `app-profiles/put-profile.ts`

Validates a profile file, uploads it to `app-profiles/profiles/<profileId>.json`, and updates `app-profiles/index.json` safely. Uses Wrangler KV (`--local` by default, `--remote` for production KV).

#### `app-profiles/list-profiles.ts`

Reads and prints profile index metadata only. Does not print full profile resource internals.

#### `app-profiles/delete-profile.ts`

Removes a profile KV key and updates the index. Requires `--profile-id` and `--yes` for destructive deletes.

#### `verify-oauth-deployment.sh`

Checks deployed OAuth metadata and challenge behavior. It validates the Worker origin, fetches Auth0 JWKS, verifies protected resource metadata, and confirms the `/mcp` endpoint returns the expected `401` challenge headers.

This script calls external services but is read-only.

#### `legacy-symbol-checks.test.mjs`

Node test suite for the legacy symbol guardrail rules implemented in `lib/legacy-symbol-checks.mjs`.

#### `repository-safety-checks.test.mjs`

Node test suite for the repository safety rules implemented in `lib/repository-safety-checks.mjs`.

#### `runtime-output-checks.test.mjs`

Node test suite for the runtime output guardrail rules implemented in `lib/runtime-output-checks.mjs`.

### `lib/` helpers

#### `lib/oauth-token-errors.sh`

Shared shell helper that formats OAuth token request failures into a clearer error message.

#### `lib/oauth-url-checks.sh`

Shared shell helper for validating OAuth-related origin URLs, rejecting placeholders, and printing the expected ChatGPT connector URL.

#### `lib/legacy-symbol-checks.mjs`

Shared Node module that defines the legacy symbol guardrail logic used to detect removed auth modes, tool-definition factories, and manifest bridge helpers in production source files.

#### `lib/repository-safety-checks.mjs`

Shared Node module that defines repository safety rules and helpers such as forbidden tracked paths, placeholder detection, secret scanning, public config validation, and violation formatting.

#### `lib/runtime-output-checks.mjs`

Shared Node module that defines the runtime output guardrail logic used to detect direct `console.*` usage in production source files.

## Safety notes

- Validation scripts such as `check-repository-safety.mjs`, `check-runtime-output.mjs`, `check-legacy-symbols.mjs`, `check-test-integrity.mjs`, and the `*.test.mjs` files are local-only.
- `setup-auth0-oauth.sh`, `sync-secrets.sh`, `sync-worker-config.sh`, and `deploy-with-env.sh` can change external systems.
- `verify-oauth-deployment.sh` and `verify-authenticated-deployment.sh` call live deployed services and should be run with the correct target environment.

## Maintenance

Keep this README aligned with the actual contents of `scripts/`. If a script is added, removed, renamed, or changes responsibility, update this file in the same change.
