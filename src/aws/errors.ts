import { GatewayError } from "../errors/public-error.js";

export class AwsRequestError extends GatewayError {
  public readonly statusCode: number;
  public readonly service?: string;
  public readonly region?: string;

  constructor(opts: {
    message?: string;
    code?: string;
    retryable?: boolean;
    statusCode?: number;
    service?: string;
    region?: string;
  }) {
    super(
      opts.code ?? "aws_request_failed",
      opts.message ?? "AWS request failed.",
      opts.retryable ?? false,
    );
    this.name = "AwsRequestError";
    this.statusCode = opts.statusCode ?? 0;
    this.service = opts.service;
    this.region = opts.region;
  }
}
