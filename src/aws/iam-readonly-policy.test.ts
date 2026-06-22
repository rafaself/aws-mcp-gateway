import { describe, expect, it } from "vitest";
import committedPolicy from "../../infra/aws/iam-readonly-policy.json?raw";
import { isReadOnlyIamAction } from "./capabilities.js";
import {
  allowedIamReadonlyPolicyActions,
  expectedIamReadonlyActions,
  extractIamPolicyActions,
  type IamPolicyDocument,
} from "./iam-readonly-policy.js";

describe("readonly IAM policy contract", () => {
  const policy = JSON.parse(committedPolicy) as IamPolicyDocument;
  const policyActions = extractIamPolicyActions(policy);
  const expectedActions = expectedIamReadonlyActions();
  const allowedActions = allowedIamReadonlyPolicyActions();

  it("includes every capability IAM action required by manifest-backed tools", () => {
    for (const action of expectedActions) {
      expect(policyActions).toContain(action);
    }
  });

  it("does not include IAM actions outside declared capabilities or documented exceptions", () => {
    for (const action of policyActions) {
      expect(allowedActions).toContain(action);
    }
  });

  it("matches the capability registry action set exactly", () => {
    expect(policyActions).toEqual(expectedActions);
  });

  it("allows only read-only IAM actions", () => {
    for (const action of policyActions) {
      expect(isReadOnlyIamAction(action)).toBe(true);
    }
  });

  it("does not include deployment-specific values", () => {
    expect(committedPolicy).not.toMatch(/AKIA/);
    expect(committedPolicy).not.toMatch(/arn:aws/);
    expect(committedPolicy).not.toMatch(/\d{12}/);
  });
});
