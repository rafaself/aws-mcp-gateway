import type { CeAmount } from "./types.js";

export function parseAmount(
  amount: CeAmount | undefined,
  fallbackCurrency: string,
): { value: number; currency: string } {
  const value = amount?.Amount ? parseFloat(amount.Amount) : 0;
  const currency = amount?.Unit ?? fallbackCurrency;
  return { value, currency };
}

export function getMetric(
  totals: Record<string, CeAmount> | undefined,
  metric: string,
): CeAmount | undefined {
  return totals?.[metric];
}
