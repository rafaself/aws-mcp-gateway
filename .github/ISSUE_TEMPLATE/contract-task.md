---
name: Contract task
about: Define behavior, constraints, and acceptance criteria before implementation
title: ""
labels: []
assignees: []
---

<!--
Guidance for authors:
- Describe public behavior before implementation details.
- State what must not change.
- Include validation and failure behavior.
- Pick the pragmatic path; avoid open-ended option lists when the best approach is already known.
- For trivial docs-only or metadata changes, use a blank issue instead of this template.
-->

## Objective

<!-- What should be true when this work is done? 1-3 sentences focused on user-visible or contract-visible outcomes. -->

## Current context

<!-- What exists today? Link related issues, specs, or code paths. Note constraints agents should respect. -->

## Non-goals

<!-- What is explicitly out of scope? Prevents scope creep and test-only success. -->

## Required behavior

<!-- Describe the contract: inputs, outputs, validation, and failure behavior. -->
<!-- Use before/after examples for behavior changes. -->

**Before:**

**After:**

**Validation and errors:**

## Security constraints

<!-- Region allowlists, read-only boundaries, redaction, auth, limits, and what must never be exposed. -->
<!-- See AGENTS.md security boundaries. If none apply, write "None beyond repository defaults." -->

## Test requirements

<!-- Behavior changes need tests that prove intended behavior, not only test-suite success. -->
<!-- Contract tests (validation, security, read-only, redaction) define the safety boundary. -->

- [ ] Tests required for this change
- [ ] Tests not required — explain why:

**Expected test coverage:**

## Documentation requirements

<!-- Update README or docs when setup, configuration, deployment, security posture, or public MCP behavior changes. -->
<!-- If no doc updates are needed, write "None." -->

## Spec under `docs/specs/`

<!-- See docs/specs/README.md. A spec is required for MCP tools, AWS clients, auth, validation, caching, CI, deployment, and security boundaries. -->
<!-- Optional for small docs fixes, mechanical refactors, and repository metadata. -->

- [ ] Spec required — add `docs/specs/<feature-name>.md` before implementation
- [ ] Spec not required — issue description is sufficient

## Acceptance criteria

<!-- Verifiable outcomes. Each item should map to a test, manual check, doc verification, or a clear reason it is not testable yet. -->

- [ ]

## Out of scope

<!-- Follow-up work, alternatives considered but rejected, or adjacent problems intentionally deferred. -->
