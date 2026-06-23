# Dependency upgrade contract

Runtime MCP/auth dependency upgrades must be treated as protocol changes until HTTP-level MCP tests prove ChatGPT-compatible discovery still works.

The `/mcp` endpoint depends on pinned runtime packages for transport, OAuth token validation, input validation, and AWS request signing. A compatible but changed release of the MCP SDK could alter session handling, response shape, headers, or `tools/list` behavior without breaking typecheck or unit tests that mock those layers.

## Pinned runtime dependencies

These packages are pinned to exact versions in `package.json`:

| Package | Role |
|---------|------|
| `@modelcontextprotocol/sdk` | MCP protocol types, server primitives, and streamable HTTP transport |
| `zod` | Tool input/output schema validation |
| `jose` | OAuth JWT verification |
| `aws4fetch` | AWS request signing for read-only tools |
| `fast-xml-parser` | EC2 XML response parsing |

Dev-only packages (TypeScript, Vitest, Wrangler, Workers types) may remain on semver ranges because they do not affect production `/mcp` behavior.

## Required commands before merging a bump

Run all of the following after changing any pinned runtime dependency:

```bash
pnpm install --frozen-lockfile
pnpm run repo:safety
pnpm run output:guardrail
pnpm run verify:connector-contract
pnpm run typecheck
pnpm test
pnpm run test:integrity
```

`verify:connector-contract` runs typecheck, unit tests, and test-integrity checks; the last three commands are listed explicitly for parity with [README.md](../README.md#testing) and [docs/deployment.md](deployment.md).

If `pnpm install --frozen-lockfile` cannot be run locally, run `pnpm install` and document why frozen-lockfile was skipped.

## Behavioral verification checklist

After automated checks pass, confirm ChatGPT Connector discovery safety:

- [ ] HTTP `initialize` still works over `/mcp` and returns `mcp-session-id`
- [ ] HTTP `tools/list` still returns all **enabled** tools (11 with default packs; 14 when `aggregates` is enabled)
- [ ] Descriptors still include `title`, `inputSchema`, `outputSchema` (where applicable), `annotations`, `securitySchemes`, and `_meta.securitySchemes`
- [ ] Unauthenticated `POST /mcp` still returns an OAuth `401` challenge with `WWW-Authenticate`
- [ ] `search`, `fetch`, and `get_gateway_status` still work without AWS calls

Automated contract tests that guard this surface:

- `src/mcp/streamable-http-handler.test.ts`
- `src/mcp/tools/descriptor-contract.test.ts`
- `src/mcp/tools/list-integration.test.ts`
- `src/index.oauth.test.ts`
- `src/test/dependency-contract.test.ts`

For manual ChatGPT validation after deployment, see [chatgpt-connector-production-acceptance.md](chatgpt-connector-production-acceptance.md) and [chatgpt-connector-smoke-test.md](chatgpt-connector-smoke-test.md).

## Security constraints

- Do not downgrade `jose` or other authentication/signature packages to insecure versions.
- Do not loosen OAuth validation to accommodate dependency behavior.
- Do not change public tool security metadata as part of a dependency bump.
- Do not suppress vulnerability warnings without documenting why the warning is not exploitable in this gateway's usage.

## Intentional version changes

If a newer version is selected during an upgrade, document why in the PR and prove the contract tests above pass against that version. Update the exact pins in `package.json` and commit the refreshed `pnpm-lock.yaml`.
