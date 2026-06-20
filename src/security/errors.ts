import { GatewayError } from "../errors.js";

export class ValidationError extends GatewayError {
  constructor(code: string, message: string) {
    super(code, message, false);
    this.name = "ValidationError";
  }
}
