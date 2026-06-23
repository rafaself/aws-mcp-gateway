import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBudgetStatus } from "./client.js";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = mockFetch;
    constructor(_opts: Record<string, unknown>) {}
  },
}));

const credentials = {
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("getBudgetStatus", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns normalized budget status with masked subscribers", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          Budgets: [
            {
              BudgetName: "monthly-spend",
              BudgetLimit: { Amount: "1000.0", Unit: "USD" },
              CalculatedSpend: { ActualSpend: { Amount: "250.0", Unit: "USD" } },
              TimeUnit: "MONTHLY",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Notifications: [
            {
              NotificationType: "ACTUAL",
              ComparisonOperator: "GREATER_THAN",
              Threshold: 80,
              ThresholdType: "PERCENTAGE",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          Subscribers: [{ SubscriptionType: "EMAIL", Address: "finance@company.com" }],
        }),
      );

    const result = await getBudgetStatus("monthly-spend", "123456789012", credentials);

    expect(result.budgetExists).toBe(true);
    expect(result.limitAmount).toBe("1000.0");
    expect(result.actualSpend).toBe("250.0");
    expect(result.notifications[0].subscribers[0].addressMasked).toBe("f***@company.com");
  });

  it("returns not found when budget is missing", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ Budgets: [] }));

    const result = await getBudgetStatus("missing", "123456789012", credentials);

    expect(result.budgetExists).toBe(false);
    expect(result.notifications).toEqual([]);
  });

  it("rejects invalid account ID before AWS call", async () => {
    await expect(getBudgetStatus("monthly", "bad", credentials)).rejects.toThrow(/accountId/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
