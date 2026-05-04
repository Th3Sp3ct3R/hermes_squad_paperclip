import { api } from "./client";

export interface UsageStats {
  totalTokens: number;
  totalCalls: number;
  totalCostCents: number;
  byModel: { model: string; calls: number; tokens: number }[];
  byDay: { date: string; tokens: number; calls: number }[];
  cacheHitRate: number;
}

export const usageStatsApi = {
  get: (companyId: string, days = 30) =>
    api.get<UsageStats>(`/usage-stats?companyId=${companyId}&days=${days}`),
};
