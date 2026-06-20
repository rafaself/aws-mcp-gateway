export interface AwsErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

export class AwsRequestError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
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
    super(opts.message ?? "AWS request failed.");
    this.name = "AwsRequestError";
    this.code = opts.code ?? "aws_request_failed";
    this.retryable = opts.retryable ?? false;
    this.statusCode = opts.statusCode ?? 0;
    this.service = opts.service;
    this.region = opts.region;
  }

  toJSON(): AwsErrorPayload {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
