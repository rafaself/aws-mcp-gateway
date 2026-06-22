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
pnpm run test:integrity
pnpm run sync-secrets
pnpm run deploy:configured
pnpm run setup:auth0
pnpm run verify:oauth
pnpm run verify:oauth:authenticated
pnpm run verify:connector-contract
```

## File guide

### Top-level scripts

#### `check-repository-safety.mjs`

Runs repository safety checks against tracked files. It detects unsafe tracked paths, secret-like values, and maintainer-specific defaults that must not be committed.

#### `check-runtime-output.mjs`

Scans production source files under `src/` and fails if `console.*` is used outside the approved observability sinks.

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

#### `verify-authenticated-deployment.sh`

Runs an authenticated smoke test against a deployed Worker. It can use either a pre-issued access token or obtain one through an OAuth client-credentials flow, then verifies MCP initialization, tool listing, and a small set of tool calls.

This script calls the deployed Worker and may call the OAuth provider.

#### `verify-connector-contract.sh`

Runs the local contract gate for the ChatGPT connector integration. It executes typecheck, tests, and test-integrity checks without depending on live ChatGPT, Auth0, Cloudflare, or AWS services.

#### `verify-oauth-deployment.sh`

Checks deployed OAuth metadata and challenge behavior. It validates the Worker origin, fetches Auth0 JWKS, verifies protected resource metadata, and confirms the `/mcp` endpoint returns the expected `401` challenge headers.

This script calls external services but is read-only.

#### `repository-safety-checks.test.mjs`

Node test suite for the repository safety rules implemented in `lib/repository-safety-checks.mjs`.

#### `runtime-output-checks.test.mjs`

Node test suite for the runtime output guardrail rules implemented in `lib/runtime-output-checks.mjs`.

### `lib/` helpers

#### `lib/oauth-token-errors.sh`

Shared shell helper that formats OAuth token request failures into a clearer error message.

#### `lib/oauth-url-checks.sh`

Shared shell helper for validating OAuth-related origin URLs, rejecting placeholders, and printing the expected ChatGPT connector URL.

#### `lib/repository-safety-checks.mjs`

Shared Node module that defines repository safety rules and helpers such as forbidden tracked paths, placeholder detection, secret scanning, public config validation, and violation formatting.

#### `lib/runtime-output-checks.mjs`

Shared Node module that defines the runtime output guardrail logic used to detect direct `console.*` usage in production source files.

## Safety notes

- Validation scripts such as `check-repository-safety.mjs`, `check-runtime-output.mjs`, `check-test-integrity.mjs`, and the `*.test.mjs` files are local-only.
- `setup-auth0-oauth.sh`, `sync-secrets.sh`, and `deploy-with-env.sh` can change external systems.
- `verify-oauth-deployment.sh` and `verify-authenticated-deployment.sh` call live deployed services and should be run with the correct target environment.

## Maintenance

Keep this README aligned with the actual contents of `scripts/`. If a script is added, removed, renamed, or changes responsibility, update this file in the same change.
