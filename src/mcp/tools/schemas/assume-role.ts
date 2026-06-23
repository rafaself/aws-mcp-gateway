import { z } from "zod";

export const assumeRoleInputFields = {
  roleArn: z
    .string()
    .optional()
    .describe(
      "Optional IAM role ARN to assume for cross-account access (for example SES in another account).",
    ),
  externalId: z
    .string()
    .optional()
    .describe("Optional external ID for the assume-role trust policy."),
};

export const assumeRoleInputSchema = z.object(assumeRoleInputFields);

export type AssumeRoleInput = z.infer<typeof assumeRoleInputSchema>;
