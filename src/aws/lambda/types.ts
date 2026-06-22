import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface LambdaListFunctionsOptions {
  regions?: string[];
  limit?: number;
}

export interface LambdaFunction {
  functionName: string;
  region: string;
  runtime: string;
  state: string;
}

export interface ListFunctionsResponse {
  Functions?: Array<{
    FunctionName?: string;
    Runtime?: string;
    State?: string;
    LastModified?: string;
    MemorySize?: number;
  }>;
  NextMarker?: string;
}

export class LambdaError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "LambdaError";
  }
}
