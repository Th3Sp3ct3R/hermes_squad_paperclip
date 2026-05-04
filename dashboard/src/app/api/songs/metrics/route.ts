import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { songs, listenSessions } from "@/lib/db/schema";
import { eq, sql, gte, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Total tracks (rubedo)
  const trackCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(songs)
    .where(eq(songs.stage, "rubedo"));
  const totalTracks = trackCount[0]?.count ?? 0;

  // 7-day listen sessions
  const recentSessions = await db
    .select()
    .from(listenSessions)
    .where(gte(listenSessions.startedAt, sevenDaysAgo));

  const totalListenedSec = recentSessions.reduce(
    (acc, s) => acc + (s.durationSec ?? 0),
    0
  );

  // Brainwave band percentages
  const bandCounts: Record<string, number> = {
    theta: 0,
    alpha: 0,
    beta: 0,
    delta: 0,
  };
  const bandSec: Record<string, number> = {
    theta: 0,
    alpha: 0,
    beta: 0,
    delta: 0,
  };
  let deepFocusCount = 0;

  for (const s of recentSessions) {
    const bw = (s.brainwave ?? "").toLowerCase();
    if (bw in bandCounts) {
      bandCounts[bw]++;
      bandSec[bw] += s.durationSec ?? 0;
    }
    if (s.deepFocus) deepFocusCount++;
  }

  const total = recentSessions.length || 1;
  const brainwaves: Record<string, number> = {};
  for (const [band, count] of Object.entries(bandCounts)) {
    brainwaves[band] = Math.round((count / total) * 100);
  }

  const deepFocusPct = Math.round((deepFocusCount / total) * 100);

  // Top 5 genres by listen time
  const genreRows = await db
    .select({
      genre: songs.genre,
      totalSec: sql<number>`coalesce(sum(${listenSessions.durationSec}), 0)`,
    })
    .from(listenSessions)
    .innerJoin(songs, eq(listenSessions.songId, songs.id))
    .groupBy(songs.genre)
    .orderBy(sql`sum(${listenSessions.durationSec}) desc`)
    .limit(5);

  const topGenres = genreRows.map((r) => ({
    genre: r.genre,
    listenSec: r.totalSec,
  }));

  // Now playing: most recent listen session
  const nowPlayingRow = await db
    .select({
      sessionId: listenSessions.id,
      songId: listenSessions.songId,
      brainwave: listenSessions.brainwave,
      startedAt: listenSessions.startedAt,
      durationSec: listenSessions.durationSec,
      deepFocus: listenSessions.deepFocus,
      songTitle: songs.title,
      songChakra: songs.chakra,
      songGenre: songs.genre,
      songHz: songs.hz,
    })
    .from(listenSessions)
    .innerJoin(songs, eq(listenSessions.songId, songs.id))
    .orderBy(desc(listenSessions.startedAt))
    .limit(1);

  const nowPlaying = nowPlayingRow[0] ?? null;

  return NextResponse.json({
    totalTracks,
    deepFocusPct,
    listenedSec: totalListenedSec,
    brainwaves,
    brainwaveSec: bandSec,
    topGenres,
    nowPlaying,
  });
}
