export type AwsMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export interface AwsRequestOptions {
  service: string;
  region: string;
  method: AwsMethod;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}
