# Spec-driven development

This directory holds short implementation specs for non-trivial changes that affect public behavior, MCP tool contracts, AWS access, validation, caching, security, CI, testing, or deployment behavior.

## Shipped specs

Some files in this directory document **implemented** behavior as living contracts — for example, [`oauth-chatgpt-connector.md`](oauth-chatgpt-connector.md) defines the current OAuth authorization contract. These are maintained alongside code and tests; they are not pre-implementation planning artifacts.

New non-trivial work still copies [`template.md`](template.md) before implementation.

## When to write a spec

A spec is **required** before implementation when a change touches any of:

- MCP tool contract (name, input schema, output format)
- AWS client behavior or IAM permissions
- Authentication or authorization logic
- Input validation rules or limits
- Caching strategy or TTLs
- CI/CD pipeline or test infrastructure
- Worker or deployment configuration
- Security boundaries or error redaction

A spec is **optional** (issue description is sufficient) for:

- Small documentation or comment fixes
- Mechanical refactors with no behavior change
- Repository metadata (labels, milestones, templates)

## How to use

1. Copy `docs/specs/template.md` into `docs/specs/<feature-name>.md`.
2. Fill each section. Keep it short and implementation-oriented.
3. Include explicit non-goals to prevent scope creep.
4. Every acceptance criterion must map to an automated test, a manual verification step, documentation-only verification, or a clear reason why it is not testable yet.
5. Reference the spec in the related GitHub issue and pull request.
