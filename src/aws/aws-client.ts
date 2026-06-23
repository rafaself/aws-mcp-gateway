import { AwsClient } from "aws4fetch";
import type { AwsCredentials } from "./types.js";

export function createAwsClient(
  credentials: AwsCredentials,
  service: string,
  region: string,
): AwsClient {
  return new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    ...(credentials.sessionToken ? { sessionToken: credentials.sessionToken } : {}),
    service,
    region,
  });
}
