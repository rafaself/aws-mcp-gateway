import type { ExecutionTelemetry } from "../telemetry/types.js";
import type { AwsCapabilityId } from "./capabilities.js";

export type AwsMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export interface AwsRequestOptions {
  capability: AwsCapabilityId;
  service: string;
  region: string;
  method: AwsMethod;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  execution?: ExecutionTelemetry;
}

export type AwsCredentialSource = "default" | "assume-role";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresAt?: number;
  source?: AwsCredentialSource;
}
