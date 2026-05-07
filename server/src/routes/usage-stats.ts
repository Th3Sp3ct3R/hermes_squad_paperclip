/**
 * Usage stats API — surfaces usage tracking data for the dashboard.
 *
 * GET /api/usage-stats?companyId=...&days=30
 *
 * Returns aggregated metrics: total tokens, total calls, cost,
 * by-model breakdown, daily trends, and cache hit rate.
 */
import { Router } from "express";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { usageLogs } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";

export function usageStatsRoutes(db: Db) {
  const router = Router();

  router.get("/usage-stats", async (req, res) => {
    const companyId = req.query.companyId as string | undefined;
    if (!companyId) {
      res.status(400).json({ error: "companyId query param is required" });
      return;
    }
    assertCompanyAccess(req, companyId);

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Total aggregates
    const [totals] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${usageLogs.tokensTotal}), 0)::int`,
        totalCalls: sql<number>`count(*)::int`,
        totalCostCents: sql<number>`coalesce(sum(${usageLogs.costCents}), 0)::int`,
        totalTokensIn: sql<number>`coalesce(sum(${usageLogs.tokensIn}), 0)::int`,
        totalTokensCached: sql<number>`coalesce(sum(${usageLogs.tokensCached}), 0)::int`,
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.companyId, companyId),
          gte(usageLogs.createdAt, since),
        ),
      );

    // By model
    const byModel = await db
      .select({
        model: usageLogs.model,
        calls: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLogs.tokensTotal}), 0)::int`,
        costCents: sql<number>`coalesce(sum(${usageLogs.costCents}), 0)::int`,
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.companyId, companyId),
          gte(usageLogs.createdAt, since),
        ),
      )
      .groupBy(usageLogs.model)
      .orderBy(desc(sql`count(*)`));

    // By day
    const byDay = await db
      .select({
        date: sql<string>`to_char(${usageLogs.createdAt}::date, 'YYYY-MM-DD')`,
        tokens: sql<number>`coalesce(sum(${usageLogs.tokensTotal}), 0)::int`,
        calls: sql<number>`count(*)::int`,
        costCents: sql<number>`coalesce(sum(${usageLogs.costCents}), 0)::int`,
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.companyId, companyId),
          gte(usageLogs.createdAt, since),
        ),
      )
      .groupBy(sql`${usageLogs.createdAt}::date`)
      .orderBy(sql`${usageLogs.createdAt}::date`);

    // By provider (for provider health strip)
    const byProvider = await db
      .select({
        provider: usageLogs.provider,
        calls: sql<number>`count(*)::int`,
        successes: sql<number>`coalesce(sum(case when ${usageLogs.success} = 1 then 1 else 0 end), 0)::int`,
        failures: sql<number>`coalesce(sum(case when ${usageLogs.success} = 0 then 1 else 0 end), 0)::int`,
        avgDurationMs: sql<number>`coalesce(avg(${usageLogs.durationMs}), 0)::int`,
        costCents: sql<number>`coalesce(sum(${usageLogs.costCents}), 0)::int`,
      })
      .from(usageLogs)
      .where(
        and(
          eq(usageLogs.companyId, companyId),
          gte(usageLogs.createdAt, since),
        ),
      )
      .groupBy(usageLogs.provider)
      .orderBy(desc(sql`count(*)`));

    const totalTokensIn = Number(totals?.totalTokensIn ?? 0);
    const totalTokensCached = Number(totals?.totalTokensCached ?? 0);
    const cacheHitRate =
      totalTokensIn > 0
        ? Math.round((totalTokensCached / totalTokensIn) * 100)
        : 0;

    res.json({
      totalTokens: Number(totals?.totalTokens ?? 0),
      totalCalls: Number(totals?.totalCalls ?? 0),
      totalCostCents: Number(totals?.totalCostCents ?? 0),
      byModel: byModel.map((r) => ({
        model: r.model,
        calls: Number(r.calls),
        tokens: Number(r.tokens),
        costCents: Number(r.costCents),
      })),
      byDay: byDay.map((r) => ({
        date: r.date,
        tokens: Number(r.tokens),
        calls: Number(r.calls),
        costCents: Number(r.costCents),
      })),
      byProvider: byProvider.map((r) => ({
        provider: r.provider,
        calls: Number(r.calls),
        successes: Number(r.successes),
        failures: Number(r.failures),
        avgDurationMs: Number(r.avgDurationMs),
        costCents: Number(r.costCents),
      })),
      cacheHitRate,
    });
  });

  return router;
}
