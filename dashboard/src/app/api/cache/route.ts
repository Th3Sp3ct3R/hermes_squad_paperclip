import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { usageDaily } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // Group usage_daily rows into 7-day chunks based on date ordering.
  // We use SQLite's strftime to derive an ISO week number for grouping.
  const weeklyRows = await db
    .select({
      week: sql<string>`strftime('%Y-W%W', ${usageDaily.date})`,
      hits: sql<number>`coalesce(sum(${usageDaily.cacheHits}), 0)`,
      reads: sql<number>`coalesce(sum(${usageDaily.cacheReads}), 0)`,
    })
    .from(usageDaily)
    .groupBy(sql`strftime('%Y-W%W', ${usageDaily.date})`)
    .orderBy(sql`strftime('%Y-W%W', ${usageDaily.date})`);

  const weeks = weeklyRows.map((r) => {
    const misses = (r.reads ?? 0) - (r.hits ?? 0);
    const rate =
      (r.reads ?? 0) > 0
        ? Math.round(((r.hits ?? 0) / (r.reads ?? 0)) * 100)
        : 0;
    return {
      week: r.week,
      hits: r.hits ?? 0,
      misses: misses > 0 ? misses : 0,
      rate,
    };
  });

  return NextResponse.json({ weeks });
}
