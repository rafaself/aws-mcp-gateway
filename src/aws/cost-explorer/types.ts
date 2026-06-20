import { ValidationError } from "../../security/errors.js";

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

export class CostExplorerError extends ValidationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "CostExplorerError";
  }
}

export interface CeAmount {
  Amount?: string;
  Unit?: string;
}

export interface CeGroup {
  Keys?: string[];
  Metrics?: Record<string, CeAmount>;
}

export interface CeResultByTime {
  TimePeriod?: { Start?: string; End?: string };
  Total?: Record<string, CeAmount>;
  Groups?: CeGroup[];
}

export interface CeResponse {
  ResultsByTime?: CeResultByTime[];
}
