export type CostGranularity = "DAILY" | "MONTHLY";
export type CostMetric = "UnblendedCost" | "AmortizedCost";

export interface CostExplorerOptions {
  startDate: string;
  endDate: string;
  granularity?: CostGranularity;
  metric?: CostMetric;
}

export interface CostSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  total: number;
}

export interface CostByServiceEntry {
  service: string;
  amount: number;
}

export interface CostByServiceResult {
  period: {
    startDate: string;
    endDate: string;
  };
  currency: string;
  total: number;
  services: CostByServiceEntry[];
}
