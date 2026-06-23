## Summary

<!-- What does this PR change and why? -->

## Related issue

<!-- Link to the GitHub issue, e.g. Closes #123 -->

## Spec

- [ ] Spec added or updated in `docs/specs/`, or not required for this change.

## Quality checklist

- [ ] Issue acceptance criteria are met.
- [ ] Full pre-PR validation passes ([README.md#testing](../README.md#testing)): `repo:safety`, `output:guardrail`, `verify:connector-contract`, `typecheck`, `test`, `test:integrity`.
- [ ] Tests were not weakened only to pass.
- [ ] No focused test marker (`.only`) was committed.
- [ ] Skipped tests include an explicit `intentional-skip:` justification.
- [ ] Security and read-only behavior are preserved.
- [ ] Unit tests do not require live AWS or Cloudflare access.
- [ ] Documentation updated when public behavior or setup changed.
- [ ] No secrets or local-only files committed.

## Test changes

<!-- Explain what test changes were made and why:
  - Added coverage for new behavior.
  - Updated existing tests to match intentional behavior change.
  - Refactored test structure without changing assertions.
  - Other (describe). -->

## Risk review

<!-- How could this change pass tests but still violate the issue, security model, or application goal? -->
