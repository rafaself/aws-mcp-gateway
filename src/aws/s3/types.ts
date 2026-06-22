import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface S3ListBucketsOptions {
  limit?: number;
}

export interface S3Bucket {
  name: string;
  createdAt: string;
}

export class S3Error extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "S3Error";
  }
}
