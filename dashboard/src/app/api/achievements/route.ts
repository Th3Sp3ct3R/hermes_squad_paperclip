import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { songs, agents, timelineEvents } from "@/lib/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALL_CHAKRAS = [
  "ROOT",
  "SACRAL",
  "SOLAR",
  "HEART",
  "THROAT",
  "THIRD_EYE",
  "CROWN",
] as const;

export async function GET() {
  const published = await db
    .select()
    .from(songs)
    .where(eq(songs.stage, "rubedo"));

  const chakraCounts: Record<string, number> = {};
  for (const c of ALL_CHAKRAS) chakraCounts[c] = 0;
  for (const s of published) {
    const key = s.chakra.toUpperCase().replace(" ", "_");
    if (key in chakraCounts) {
      chakraCounts[key]++;
    }
  }

  const chakrasCovered = Object.values(chakraCounts).filter((n) => n > 0).length;
  const minChakraCount = Math.min(...Object.values(chakraCounts));
  const throatChakraSongs = chakraCounts["THROAT"] ?? 0;

  const allAgents = await db.select().from(agents);
  const agentsShipped = allAgents.filter((a) => a.hasShipped).length;

  const solveCoagula = await db
    .select({ count: sql<number>`count(*)` })
    .from(songs)
    .where(
      and(isNotNull(songs.rejectedAt), isNotNull(songs.reapprovedAt))
    );

  const eventsCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(timelineEvents);

  return NextResponse.json({
    summary: {
      published: published.length,
      chakraCounts,
      chakrasCovered,
      minChakraCount,
      throatChakraSongs,
      agentsShipped,
      solveCoagula: solveCoagula[0]?.count ?? 0,
      timelineEvents: eventsCount[0]?.count ?? 0,
    },
    agents: allAgents.map((a) => ({ key: a.key, hasShipped: a.hasShipped })),
  });
}
