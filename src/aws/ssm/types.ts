import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface SsmParameterInventoryEntry {
  name: string;
  path: string;
  exists: boolean;
  type?: string;
  version?: number;
  lastModifiedDate?: string;
  keyId?: string;
  suspiciousMetadata?: boolean;
}

export interface SsmParameterInventoryResult {
  region: string;
  parameterPrefix: string;
  missingCount: number;
  parameters: SsmParameterInventoryEntry[];
}

export interface SsmRawParameterMetadata {
  Name?: string;
  ARN?: string;
  Type?: string;
  KeyId?: string;
  LastModifiedDate?: number;
  LastModifiedUser?: string;
  Description?: string;
  AllowedPattern?: string;
  Version?: number;
  Tier?: string;
  Policies?: unknown;
  DataType?: string;
  Value?: string;
}

export interface SsmDescribeParametersResponse {
  Parameters?: SsmRawParameterMetadata[];
  NextToken?: string;
}

export class SsmError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "SsmError";
  }
}
