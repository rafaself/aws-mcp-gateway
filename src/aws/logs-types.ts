import { ValidationError } from "../security/errors.js";

export interface LogEvent {
  logGroupName: string;
  logStreamName: string;
  timestamp: string;
  message: string;
  region: string;
}

export interface FilterLogEventsResponse {
  events?: Array<{
    logStreamName?: string;
    timestamp?: number;
    message?: string;
  }>;
  nextToken?: string;
}

export interface FilterLogEventsOptions {
  logGroupName: string;
  filterPattern?: string;
  startTime?: number;
  endTime?: number;
}

export class LogsError extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "LogsError";
  }
}
