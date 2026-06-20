# AGENTS.md

## Repository purpose

A minimal Cloudflare Worker MCP gateway for explicit, read-only AWS tools.

Hard boundaries:
- No generic AWS CLI execution tool.
- No arbitrary AWS API proxy.
- No AWS write/management operations in the MVP.
- No secrets, local env files, tokens, credentials, or generated Wrangler state committed.

## Workflow

- Work from the related GitHub issue when available.
- Keep PRs small and focused on the issue scope.
- Prefer TDD when practical: write a failing test first, implement the smallest safe change, then refactor.
- For non-trivial work, use the issue or spec as source of truth.
- Do not expand scope beyond the issue without documenting why.
- When blocked, leave a clear note with what was tried and what remains.

## Development commands

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run test:coverage
pnpm dev
```

- `pnpm run typecheck` is required before finishing any code changes.
- `pnpm test` is required when code or behavior changes.
- `pnpm run test:coverage` is recommended before larger PRs but not mandatory for trivial or docs-only changes.

## Code organization

Source layout:

```text
src/auth/       bearer auth
src/aws/        AWS request client and service-specific clients
src/cache/      cache helpers
src/config/     env validation and gateway context
src/errors/     error classes and handling
src/mcp/        MCP server and tool registration
src/security/   limits, dates, region validation, redaction helpers
src/test/       shared test setup and fixtures
```

Rules:
- Keep files focused by responsibility; avoid large mixed-responsibility files.
- Avoid flat folders as the project grows.
- Avoid generic `utils.ts` files for domain logic.
- AWS modules must not import MCP modules.
- MCP modules may import AWS clients, security, and config helpers.

## Security boundaries

- Validate tool inputs before external calls.
- Enforce region allowlists for regional AWS tools.
- Enforce date and result-size limits.
- Return normalized output — never raw provider responses.
- Never expose credentials, bearer tokens, signed headers, raw stack traces, or raw AWS responses.
- Do not add new production dependencies without a clear reason.

## Testing expectations

- Unit tests must not call real AWS APIs.
- Mock AWS and network behavior at the module level.
- A global fetch guard in `src/test/setup.ts` rejects unmocked network requests — do not bypass it.
- Add or update tests when changing validation, parsing, formatting, error handling, security checks, or AWS client behavior.
- Prefer colocated tests alongside their source module.

## Documentation expectations

- Update README and docs when setup, configuration, deployment, security posture, or public MCP behavior changes.
- Keep detailed implementation plans in GitHub issues — not in AGENTS.md or README.

## Git conventions

Use conventional commits:

```text
type(scope): message
```

Examples:

```text
feat(mcp): add cost summary tool
security(auth): harden bearer token validation
docs(agents): clarify codex guidance
refactor(structure): organize source modules
```

## Done criteria

Before handing off:
- The change matches the issue scope.
- Required checks pass (`pnpm run typecheck`, `pnpm test`), or are skipped with a clear reason.
- No secrets or local-only files were added.
- Documentation is updated when behavior or setup changed.
- AGENTS.md remains concise and repository-specific — no architecture docs or issue backlog here.
