import { api } from "./client";

export interface UsageStats {
  totalTokens: number;
  totalCalls: number;
  totalCostCents: number;
  byModel: { model: string; calls: number; tokens: number; costCents: number }[];
  byDay: { date: string; tokens: number; calls: number; costCents: number }[];
  byProvider: {
    provider: string;
    calls: number;
    successes: number;
    failures: number;
    avgDurationMs: number;
    costCents: number;
  }[];
  cacheHitRate: number;
}

export const usageStatsApi = {
  get: (companyId: string, days = 30) =>
    api.get<UsageStats>(`/usage-stats?companyId=${companyId}&days=${days}`),
};
