import { createAwsClient } from "../aws-client.js";
import { assertAwsCapability, type AwsCapabilityId } from "../capabilities.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import type {
  BudgetsDescribeBudgetsResponse,
  BudgetsDescribeNotificationsResponse,
  BudgetsDescribeSubscribersResponse,
} from "./types.js";
import { BudgetError } from "./types.js";

const BUDGETS_TARGET_PREFIX = "AWSBudgetServiceGateway";
const BUDGETS_REGION = "us-east-1";
const REQUEST_TIMEOUT_MS = 15_000;

function parseAwsErrorType(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { __type?: string; Message?: string };
    const rawType = parsed.__type;
    if (rawType) {
      const slash = rawType.lastIndexOf("#");
      return slash >= 0 ? rawType.slice(slash + 1) : rawType;
    }
    if (parsed.Message?.includes("NotFound")) return "NotFoundException";
    return undefined;
  } catch {
    return undefined;
  }
}

async function budgetsRequest<T>(
  capability: AwsCapabilityId,
  target: string,
  body: Record<string, unknown>,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<T> {
  assertAwsCapability(capability);

  const client = createAwsClient(credentials, "budgets", BUDGETS_REGION);
  const url = `https://budgets.amazonaws.com/`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await client.fetch(url, {
      method: "POST",
      headers: {
        "X-Amz-Target": `${BUDGETS_TARGET_PREFIX}.${target}`,
        "Content-Type": "application/x-amz-json-1.1",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();

    if (!response.ok) {
      const awsErrorType = parseAwsErrorType(text);
      if (awsErrorType === "NotFoundException" || response.status === 404) {
        throw new BudgetError("not_found", "Budget was not found.", awsErrorType);
      }
      if (awsErrorType === "AccessDeniedException" || response.status === 403) {
        throw new BudgetError(
          "aws_request_failed",
          "Access denied for budget request.",
          awsErrorType,
        );
      }
      throw new BudgetError("aws_request_failed", "Budget request failed.", awsErrorType);
    }

    execution?.recordAwsRequest(capability, BUDGETS_REGION);

    if (text.length === 0) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof BudgetError) {
      throw err;
    }

    if ((err as Error).name === "AbortError") {
      throw new BudgetError("aws_request_failed", "Budget request timed out.");
    }

    throw new BudgetError("aws_request_failed", "Budget request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function describeBudgets(
  accountId: string,
  budgetName: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<BudgetsDescribeBudgetsResponse> {
  return budgetsRequest<BudgetsDescribeBudgetsResponse>(
    "budgets:DescribeBudgets",
    "DescribeBudgets",
    {
      AccountId: accountId,
      BudgetName: budgetName,
    },
    credentials,
    execution,
  );
}

export async function describeNotificationsForBudget(
  accountId: string,
  budgetName: string,
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<BudgetsDescribeNotificationsResponse> {
  return budgetsRequest<BudgetsDescribeNotificationsResponse>(
    "budgets:DescribeNotificationsForBudget",
    "DescribeNotificationsForBudget",
    {
      AccountId: accountId,
      BudgetName: budgetName,
    },
    credentials,
    execution,
  );
}

export async function describeSubscribersForNotification(
  accountId: string,
  budgetName: string,
  notification: {
    NotificationType?: string;
    ComparisonOperator?: string;
    Threshold?: number;
    ThresholdType?: string;
  },
  credentials: AwsCredentials,
  execution?: ExecutionTelemetry,
): Promise<BudgetsDescribeSubscribersResponse> {
  return budgetsRequest<BudgetsDescribeSubscribersResponse>(
    "budgets:DescribeSubscribersForNotification",
    "DescribeSubscribersForNotification",
    {
      AccountId: accountId,
      BudgetName: budgetName,
      Notification: notification,
    },
    credentials,
    execution,
  );
}

export function isBudgetNotFoundError(err: unknown): boolean {
  return err instanceof BudgetError && err.code === "not_found";
}

export function isBudgetAccessDeniedError(err: unknown): boolean {
  return err instanceof BudgetError && err.awsErrorType === "AccessDeniedException";
}
