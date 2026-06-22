import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

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

export interface LogGroup {
  name: string;
}

export interface DescribeLogGroupsResponse {
  logGroups?: Array<{
    logGroupName?: string;
    creationTime?: number;
    retentionInDays?: number;
    storedBytes?: number;
  }>;
  nextToken?: string;
}

export class LogsError extends ValidationError {
  constructor(code: GatewayErrorCode, message: string) {
    super(code, message);
    this.name = "LogsError";
  }
}
