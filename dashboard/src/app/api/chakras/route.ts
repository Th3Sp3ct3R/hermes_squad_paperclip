import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { songs, listenSessions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

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
  // Tracks per chakra (rubedo only)
  const trackRows = await db
    .select({
      chakra: songs.chakra,
      count: sql<number>`count(*)`,
    })
    .from(songs)
    .where(eq(songs.stage, "rubedo"))
    .groupBy(songs.chakra);

  const counts: Record<string, number> = {};
  for (const c of ALL_CHAKRAS) counts[c.toLowerCase()] = 0;
  for (const r of trackRows) counts[r.chakra.toLowerCase()] = r.count;

  // Listen seconds per chakra
  const listenRows = await db
    .select({
      chakra: songs.chakra,
      totalSec: sql<number>`coalesce(sum(${listenSessions.durationSec}), 0)`,
    })
    .from(listenSessions)
    .innerJoin(songs, eq(listenSessions.songId, songs.id))
    .groupBy(songs.chakra);

  const durationSec: Record<string, number> = {};
  for (const c of ALL_CHAKRAS) durationSec[c.toLowerCase()] = 0;
  for (const r of listenRows) durationSec[r.chakra.toLowerCase()] = r.totalSec;

  const totalTracks = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalListenedSec = Object.values(durationSec).reduce((a, b) => a + b, 0);

  return NextResponse.json({
    counts,
    durationSec,
    totalTracks,
    totalListenedSec,
  });
}
