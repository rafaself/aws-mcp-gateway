import { ValidationError } from "../../security/errors.js";
import type { GatewayErrorCode } from "../../errors/public-error.js";

export interface BudgetSubscriberSummary {
  type: string;
  addressMasked: string;
}

export interface BudgetNotificationSummary {
  notificationType: string;
  comparisonOperator?: string;
  threshold?: number;
  thresholdType?: string;
  subscribers: BudgetSubscriberSummary[];
}

export interface BudgetStatusResult {
  accountId: string;
  budgetName: string;
  budgetExists: boolean;
  limitAmount?: string;
  limitUnit?: string;
  actualSpend?: string;
  forecastedSpend?: string;
  timeUnit?: string;
  notifications: BudgetNotificationSummary[];
}

export interface BudgetsDescribeBudgetsResponse {
  Budgets?: Array<{
    BudgetName?: string;
    BudgetLimit?: { Amount?: string; Unit?: string };
    CalculatedSpend?: {
      ActualSpend?: { Amount?: string; Unit?: string };
    };
    TimeUnit?: string;
  }>;
}

export interface BudgetsDescribeNotificationsResponse {
  Notifications?: Array<{
    NotificationType?: string;
    ComparisonOperator?: string;
    Threshold?: number;
    ThresholdType?: string;
    NotificationState?: string;
  }>;
}

export interface BudgetsDescribeSubscribersResponse {
  Subscribers?: Array<{
    SubscriptionType?: string;
    Address?: string;
  }>;
}

export class BudgetError extends ValidationError {
  public readonly awsErrorType?: string;

  constructor(code: GatewayErrorCode, message: string, awsErrorType?: string) {
    super(code, message);
    this.name = "BudgetError";
    this.awsErrorType = awsErrorType;
  }
}
