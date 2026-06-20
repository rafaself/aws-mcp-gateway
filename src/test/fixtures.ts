export function ceResponse(resultsByTime: Array<Record<string, unknown>>) {
  return new Response(JSON.stringify({ ResultsByTime: resultsByTime }), {
    status: 200,
    headers: { "content-type": "application/x-amz-json-1.1" },
  });
}

export function makeDayTotal(
  start: string,
  end: string,
  amount: string,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: amount, Unit: unit } },
  };
}

export function makeDayWithGroups(
  start: string,
  end: string,
  totalAmount: string,
  groups: Array<{ key: string; amount: string }>,
  unit = "USD",
  metric = "UnblendedCost",
) {
  return {
    TimePeriod: { Start: start, End: end },
    Total: { [metric]: { Amount: totalAmount, Unit: unit } },
    Groups: groups.map((g) => ({
      Keys: [g.key],
      Metrics: { [metric]: { Amount: g.amount, Unit: unit } },
    })),
  };
}
