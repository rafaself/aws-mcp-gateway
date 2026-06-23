import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface EventBridgeTargetSummary {
  id?: string;
  arn?: string;
  roleArn?: string;
}

export interface EventBridgeRuleSummary {
  name: string;
  state: string;
  scheduleExpression?: string;
  eventPatternSummary?: string;
  targetCount: number;
  targets: EventBridgeTargetSummary[];
}

export interface SchedulerScheduleSummary {
  name: string;
  state: string;
  scheduleExpression?: string;
  targetArn?: string;
  targetRoleArn?: string;
}

export interface EventBridgeRulesStatusResult {
  region: string;
  rules: EventBridgeRuleSummary[];
  schedules: SchedulerScheduleSummary[];
  truncated: boolean;
}

export interface EventBridgeListRulesResponse {
  Rules?: Array<{
    Name?: string;
    Arn?: string;
    State?: string;
    ScheduleExpression?: string;
    EventPattern?: string;
  }>;
  NextToken?: string;
}

export interface EventBridgeDescribeRuleResponse {
  Name?: string;
  Arn?: string;
  State?: string;
  ScheduleExpression?: string;
  EventPattern?: string;
}

export interface EventBridgeListTargetsByRuleResponse {
  Targets?: Array<{
    Id?: string;
    Arn?: string;
    RoleArn?: string;
    Input?: string;
    InputPath?: string;
    InputTransformer?: Record<string, unknown>;
    DeadLetterConfig?: Record<string, unknown>;
  }>;
  NextToken?: string;
}

export interface SchedulerListSchedulesResponse {
  Schedules?: Array<{
    Name?: string;
    Arn?: string;
    State?: string;
  }>;
  NextToken?: string;
}

export interface SchedulerGetScheduleResponse {
  Name?: string;
  Arn?: string;
  State?: string;
  ScheduleExpression?: string;
  Target?: {
    Arn?: string;
    RoleArn?: string;
    Input?: string;
  };
}

export class EventBridgeError extends ValidationError {
  public readonly awsErrorType?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorType?: string) {
    super(code, message);
    this.name = "EventBridgeError";
    this.awsErrorType = awsErrorType;
  }
}
