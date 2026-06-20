import { GatewayError } from "../errors/public-error.js";

export class ValidationError extends GatewayError {
  constructor(code: string, message: string) {
    super(code, message, false);
    this.name = "ValidationError";
  }
}
