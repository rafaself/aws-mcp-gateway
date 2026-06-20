name: Spec-driven change
description: File a non-trivial change that may require a spec under docs/specs/
title: "[short description]"
labels: []
body:
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What needs to change and why
    validations:
      required: true
  - type: dropdown
    id: spec-required
    attributes:
      label: Spec required?
      description: Does this change require a spec under docs/specs/?
      options:
        - "Yes"
        - "No"
        - "Not sure"
    validations:
      required: true
  - type: textarea
    id: expected-behavior
    attributes:
      label: Expected behavior
      description: How should the system behave after the change?
      placeholder: |
        Before: ...
        After: ...
    validations:
      required: false
  - type: textarea
    id: security-considerations
    attributes:
      label: Security considerations
      description: What security controls, data exposure, or error handling concerns exist?
    validations:
      required: false
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance criteria
      description: Verifiable outcomes for this change
      placeholder: |
        - [ ] ...
    validations:
      required: false
  - type: textarea
    id: test-plan
    attributes:
      label: Test plan
      description: How will this change be tested?
    validations:
      required: false
