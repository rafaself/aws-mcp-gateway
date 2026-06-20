import {
  Ec2Error,
  VALID_INSTANCE_STATES,
} from "./types.js";

function validateStateFilter(state: string): void {
  if (!(VALID_INSTANCE_STATES as readonly string[]).includes(state)) {
    throw new Ec2Error(
      "validation_error",
      `Invalid EC2 instance state "${state}". Valid states: ${VALID_INSTANCE_STATES.join(", ")}`,
    );
  }
}

export function validateStateFilters(states: string[]): void {
  for (const state of states) {
    validateStateFilter(state);
  }
}

export function buildDescribeInstancesParams(
  stateFilters: string[],
): Record<string, string> {
  const params: Record<string, string> = {};

  if (stateFilters.length > 0) {
    params["Filter.1.Name"] = "instance-state-name";
    stateFilters.forEach((state, index) => {
      params[`Filter.1.Value.${index + 1}`] = state;
    });
  }

  return params;
}
