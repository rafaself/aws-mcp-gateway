import { SSM_MAX_DESCRIBE_RESULTS } from "../../security/limits.js";

export function buildDescribeParametersBody(
  parameterPrefix: string,
  nextToken?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    MaxResults: Math.min(SSM_MAX_DESCRIBE_RESULTS, 50),
    ParameterFilters: [
      {
        Key: "Name",
        Option: "BeginsWith",
        Values: [parameterPrefix],
      },
    ],
  };

  if (nextToken) {
    body.NextToken = nextToken;
  }

  return body;
}

export const SSM_DESCRIBE_PARAMETERS_TARGET = "AmazonSSM.DescribeParameters";
