import type { AwsCredentials } from "../types.js";

const ROLE_ARN_PATTERN = /^arn:aws:iam::\d{12}:role\/[\w+=,.@\-/]+$/;

export function isValidRoleArn(roleArn: string): boolean {
  return ROLE_ARN_PATTERN.test(roleArn);
}

export async function buildCredentialCacheKey(
  roleArn: string,
  externalId?: string,
): Promise<string> {
  const material = externalId ? `${roleArn}\0${externalId}` : roleArn;
  const encoded = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function withDefaultSource(credentials: AwsCredentials): AwsCredentials {
  return {
    ...credentials,
    source: "default",
  };
}
