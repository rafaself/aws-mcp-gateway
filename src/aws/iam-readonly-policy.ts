import {
  AWS_CAPABILITY_IDS,
  awsActionsForCapabilities,
} from "./capabilities.js";

/**
 * IAM actions allowed in the checked-in readonly policy without a matching capability.
 * Keep empty unless an exception is explicitly documented and tested.
 */
export const IAM_READONLY_POLICY_EXCEPTIONS: readonly string[] = [];

export type IamPolicyDocument = {
  Version: string;
  Statement: ReadonlyArray<{
    Effect: string;
    Action: string | readonly string[];
    Resource?: string | readonly string[];
    Sid?: string;
  }>;
};

export function extractIamPolicyActions(policy: IamPolicyDocument): string[] {
  const actions = new Set<string>();

  for (const statement of policy.Statement) {
    const statementActions = statement.Action;
    if (typeof statementActions === "string") {
      actions.add(statementActions);
      continue;
    }

    for (const action of statementActions) {
      actions.add(action);
    }
  }

  return [...actions].sort();
}

export function expectedIamReadonlyActions(): string[] {
  return awsActionsForCapabilities(AWS_CAPABILITY_IDS);
}

export function allowedIamReadonlyPolicyActions(): string[] {
  return [...new Set([...expectedIamReadonlyActions(), ...IAM_READONLY_POLICY_EXCEPTIONS])].sort();
}
