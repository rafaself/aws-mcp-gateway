import type { KVNamespace } from "@cloudflare/workers-types";
import { buildCacheKey } from "../../cache/keys.js";
import { cacheReadWithStatus } from "../../cache/read.js";
import { cacheSet } from "../../cache/kv.js";
import { BUDGET_CACHE_TTL_SECONDS } from "../../security/limits.js";
import type { ExecutionTelemetry } from "../../telemetry/types.js";
import type { AwsCredentials } from "../types.js";
import {
  buildNotFoundBudgetStatus,
  normalizeBudgetStatus,
  normalizeNotification,
} from "./parse.js";
import {
  describeBudgets,
  describeNotificationsForBudget,
  describeSubscribersForNotification,
  isBudgetNotFoundError,
} from "./requests.js";
import type { BudgetStatusResult } from "./types.js";
import { validateAccountId, validateBudgetName } from "./validation.js";

export async function getBudgetStatus(
  budgetName: string,
  accountId: string,
  credentials: AwsCredentials,
  cache?: KVNamespace,
  execution?: ExecutionTelemetry,
  cacheOptions?: { roleArn?: string },
): Promise<BudgetStatusResult> {
  const name = validateBudgetName(budgetName);
  const account = validateAccountId(accountId);

  const cacheKey = await buildCacheKey("get_budget_status", {
    budgetName: name,
    accountId: account,
    ...(cacheOptions?.roleArn ? { roleArn: cacheOptions.roleArn } : {}),
  });
  const { value: cached } = await cacheReadWithStatus<BudgetStatusResult>(
    cache,
    cacheKey,
    execution,
  );
  if (cached) {
    return cached;
  }

  try {
    const budgetsResponse = await describeBudgets(account, name, credentials, execution);
    const budget = budgetsResponse.Budgets?.[0];
    if (!budget) {
      const result = buildNotFoundBudgetStatus(account, name);
      if (cache) {
        await cacheSet(cache, cacheKey, result, BUDGET_CACHE_TTL_SECONDS);
      }
      return result;
    }

    const notificationsResponse = await describeNotificationsForBudget(
      account,
      name,
      credentials,
      execution,
    );
    const notifications = await Promise.all(
      (notificationsResponse.Notifications ?? []).map(async (notification) => {
        const subscribers = await describeSubscribersForNotification(
          account,
          name,
          notification,
          credentials,
          execution,
        );
        return normalizeNotification(notification, subscribers);
      }),
    );

    const result = normalizeBudgetStatus(account, budget, notifications);
    if (cache) {
      await cacheSet(cache, cacheKey, result, BUDGET_CACHE_TTL_SECONDS);
    }
    return result;
  } catch (err) {
    if (isBudgetNotFoundError(err)) {
      const result = buildNotFoundBudgetStatus(account, name);
      if (cache) {
        await cacheSet(cache, cacheKey, result, BUDGET_CACHE_TTL_SECONDS);
      }
      return result;
    }
    throw err;
  }
}
