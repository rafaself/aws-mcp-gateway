import { XMLParser } from "fast-xml-parser";

export type AssumedRoleCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false,
});

export function parseAssumeRoleResponse(text: string): AssumedRoleCredentials {
  const parsed = parser.parse(text) as {
    AssumeRoleResponse?: {
      AssumeRoleResult?: {
        Credentials?: {
          AccessKeyId?: string;
          SecretAccessKey?: string;
          SessionToken?: string;
          Expiration?: string;
        };
      };
    };
    ErrorResponse?: {
      Error?: {
        Code?: string;
        Message?: string;
      };
    };
  };

  if (parsed.ErrorResponse?.Error) {
    throw new Error("STS AssumeRole failed.");
  }

  const credentials = parsed.AssumeRoleResponse?.AssumeRoleResult?.Credentials;
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken ||
    !credentials.Expiration
  ) {
    throw new Error("STS AssumeRole response missing credentials.");
  }

  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiration: credentials.Expiration,
  };
}
