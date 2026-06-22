# AGENTS.md

## Repository purpose

A minimal Cloudflare Worker MCP gateway for explicit, read-only AWS tools.

Hard boundaries:
- No generic AWS CLI execution tool.
- No arbitrary AWS API proxy.
- No AWS write/management operations in the current read-only scope.
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
src/aws/cost-explorer/
src/aws/ec2/
src/aws/cloudwatch/
src/aws/logs/
src/cache/      cache helpers
src/config/     env validation and gateway context
src/errors/     error classes and handling
src/mcp/        MCP server and tool registration
src/mcp/audit/  MCP tool audit payload builders
src/observability/ centralized runtime output sinks
src/security/   limits, dates, region validation, redaction helpers
src/test/       shared test setup and fixtures
```

Rules:
- Keep files focused by responsibility; avoid large mixed-responsibility files.
- Avoid flat folders as the project grows.
- Avoid generic `utils.ts` files for domain logic.
- AWS modules must not import MCP modules.
- MCP modules may import AWS clients, security, config context types, and config helpers.

## Security boundaries

- Validate tool inputs before external calls.
- Enforce region allowlists for regional AWS tools.
- Enforce date and result-size limits.
- Return normalized output — never raw provider responses.
- Never expose or log credentials, bearer tokens, signed headers, raw stack traces, or raw AWS responses.
- All production `console.*` output must go through `src/observability/` (operational logging in `logging.ts`, structured audit lines in `audit.ts`).
- Do not add new production dependencies without a clear reason.

## Testing expectations

- Unit tests must not call real AWS APIs.
- Mock AWS and network behavior at the module level.
- A global fetch guard in `src/test/setup.ts` rejects unmocked network requests — do not bypass it.
- Add or update tests when changing validation, parsing, formatting, error handling, security checks, or AWS client behavior.
- Prefer colocated tests alongside their source module.

## Source of truth

- `AGENTS.md` defines permanent repository rules and conventions.
- GitHub issues define task-specific behavior and acceptance criteria.
- Tests verify behavior but do not replace the issue or spec.
- When a test and the issue disagree, the issue wins — update the test, not the issue.

## Test integrity

- A passing test suite is **required but not sufficient**.
- Tests must prove the intended behavior from the issue or spec, not just pass.
- Security, validation, redaction, authentication, region allowlist, and read-only behavior tests are **contract tests** — they define the safety boundary.
- Do not weaken assertions, delete tests, add focused tests, skip failing tests, over-mock behavior, or change expected behavior without a matching issue or spec change.
- When modifying tests, explain whether the change adds coverage, updates intentional behavior, or only refactors test structure.
- `pnpm run test:integrity` checks for focused and unjustified skipped tests — do not bypass it.

## Forbidden shortcuts

- Do not mark tests with `test.only`, `describe.only`, or `it.only`.
- Do not skip tests with `test.skip`, `describe.skip`, or `it.skip` without an explicit `intentional-skip:` justification on the same line.
- Do not delete or weaken contract tests to make unrelated changes pass.
- Do not add `.only` to debug during development and leave it in the commit.

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
- When touching tracked config, scripts, or repository hygiene, `pnpm run repo:safety` passes.
- When touching production logging, audit output, or observability code, `pnpm run output:guardrail` passes.
- No secrets or local-only files were added.
- Documentation is updated when behavior or setup changed.
- AGENTS.md remains concise and repository-specific — no architecture docs or issue backlog here.
