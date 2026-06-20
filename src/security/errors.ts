import { GatewayError, type GatewayErrorCode } from "../errors/public-error.js";

export class ValidationError extends GatewayError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message, false);
    this.name = "ValidationError";
  }
}
