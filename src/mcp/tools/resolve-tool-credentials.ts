import type { GatewayContext } from "../../config/context.js";
import { isValidRoleArn } from "../../aws/credentials/helpers.js";
import type { AwsCredentials } from "../../aws/types.js";
import { ValidationError } from "../../security/errors.js";

export type ToolCredentialOptions = {
  roleArn?: string;
  externalId?: string;
};

export async function resolveToolCredentials(
  ctx: GatewayContext,
  options?: ToolCredentialOptions,
): Promise<AwsCredentials> {
  if (!options?.roleArn) {
    return ctx.credentials;
  }

  if (!isValidRoleArn(options.roleArn)) {
    throw new ValidationError(
      "validation_error",
      "roleArn must be a valid IAM role ARN (arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME).",
    );
  }

  return ctx.credentialResolver.resolve({
    strategy: "assume-role",
    roleArn: options.roleArn,
    externalId: options.externalId,
  });
}
