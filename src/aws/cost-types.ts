export interface CostExplorerOptions {
  startDate: string;
  endDate: string;
  granularity?: "DAILY" | "MONTHLY";
  metric?: string;
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
