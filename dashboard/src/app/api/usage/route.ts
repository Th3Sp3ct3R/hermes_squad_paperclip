import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usageDaily, modelsUsage } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const byDay = await db.select().from(usageDaily);

  const models = await db
    .select()
    .from(modelsUsage)
    .orderBy(desc(modelsUsage.pctOfCalls));

  // Compute totals
  const totals = await db
    .select({
      totalTokensIn: sql<number>`coalesce(sum(${usageDaily.tokensIn}), 0)`,
      totalTokensOut: sql<number>`coalesce(sum(${usageDaily.tokensOut}), 0)`,
      totalCacheHits: sql<number>`coalesce(sum(${usageDaily.cacheHits}), 0)`,
      totalCacheReads: sql<number>`coalesce(sum(${usageDaily.cacheReads}), 0)`,
      totalCalls: sql<number>`coalesce(sum(${usageDaily.apiCalls}), 0)`,
    })
    .from(usageDaily);

  const t = totals[0];
  const totalTokens = (t?.totalTokensIn ?? 0) + (t?.totalTokensOut ?? 0);
  const totalCalls = t?.totalCalls ?? 0;
  const cacheHitRate =
    (t?.totalCacheReads ?? 0) > 0
      ? Math.round(
          ((t?.totalCacheHits ?? 0) / (t?.totalCacheReads ?? 0)) * 100
        )
      : 0;

  return NextResponse.json({
    byDay,
    models,
    totalTokens,
    totalCalls,
    cacheHitRate,
  });
}
