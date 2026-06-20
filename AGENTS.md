
# AGENTS.md

## Repository expectations

- Keep changes small, focused, and aligned with the related GitHub issue.
- Preserve the project goal: a minimal, security-focused, read-only AWS MCP gateway.
- Do not add generic AWS execution, broad API proxying, or write-capable AWS behavior unless an issue explicitly changes the project scope.
- Do not commit secrets, local env files, tokens, credentials, or generated Wrangler state.

## Development

- Use npm.
- Run `pnpm run typecheck` before finishing code changes.
- Add or update tests when changing validation, formatting, security checks, or AWS client behavior.
- Update documentation when setup, configuration, security posture, or public behavior changes.
- Prefer TDD when practical: write a focused failing test before implementation, then implement the smallest safe change and refactor after it passes.
- Prefer spec-driven changes for non-trivial work: define goal, non-goals, behavior, security constraints, acceptance criteria, and test plan before implementation.

## Code quality

- Prefer explicit, typed TypeScript over implicit or loosely typed code.
- Keep MCP tools specific and allowlisted.
- Validate tool inputs before external calls.
- Keep error messages safe and avoid leaking credentials, tokens, signed headers, raw stack traces, or raw provider responses.
- Avoid unnecessary dependencies; justify any new production dependency.

## Git

Use conventional commits:

```text
type(scope): message
````

Examples:

```text
feat(mcp): add cost summary tool
security(auth): harden bearer token validation
docs(readme): clarify worker deployment
test(security): cover region validation
```

## Done criteria

Before handing off:

* The change matches the issue scope.
* Required checks were run, or skipped with a clear reason.
* No secrets or local-only files were added.
* Documentation is updated when behavior or setup changed.
