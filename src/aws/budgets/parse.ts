import { maskEmailAddress, maskSubscriptionEndpoint } from "../../security/masking.js";
import type {
  BudgetNotificationSummary,
  BudgetStatusResult,
  BudgetsDescribeBudgetsResponse,
  BudgetsDescribeNotificationsResponse,
  BudgetsDescribeSubscribersResponse,
} from "./types.js";

function maskSubscriberAddress(type: string, address: string): string {
  if (type === "EMAIL") {
    return maskEmailAddress(address);
  }
  return maskSubscriptionEndpoint(address, type.toLowerCase());
}

export function buildNotFoundBudgetStatus(
  accountId: string,
  budgetName: string,
): BudgetStatusResult {
  return {
    accountId,
    budgetName,
    budgetExists: false,
    notifications: [],
  };
}

export function normalizeBudgetStatus(
  accountId: string,
  budget: NonNullable<BudgetsDescribeBudgetsResponse["Budgets"]>[number],
  notifications: BudgetNotificationSummary[],
): BudgetStatusResult {
  return {
    accountId,
    budgetName: budget.BudgetName ?? "unknown",
    budgetExists: true,
    limitAmount: budget.BudgetLimit?.Amount,
    limitUnit: budget.BudgetLimit?.Unit,
    actualSpend: budget.CalculatedSpend?.ActualSpend?.Amount,
    forecastedSpend: undefined,
    timeUnit: budget.TimeUnit,
    notifications,
  };
}

export function normalizeNotification(
  notification: NonNullable<BudgetsDescribeNotificationsResponse["Notifications"]>[number],
  subscribersResponse: BudgetsDescribeSubscribersResponse,
): BudgetNotificationSummary {
  const subscribers = (subscribersResponse.Subscribers ?? []).map((subscriber) => ({
    type: subscriber.SubscriptionType ?? "unknown",
    addressMasked: maskSubscriberAddress(
      subscriber.SubscriptionType ?? "",
      subscriber.Address ?? "",
    ),
  }));

  return {
    notificationType: notification.NotificationType ?? "unknown",
    ...(notification.ComparisonOperator
      ? { comparisonOperator: notification.ComparisonOperator }
      : {}),
    ...(notification.Threshold !== undefined ? { threshold: notification.Threshold } : {}),
    ...(notification.ThresholdType ? { thresholdType: notification.ThresholdType } : {}),
    subscribers,
  };
}
