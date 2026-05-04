import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const allSessions = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.ts));
  return NextResponse.json(allSessions);
}
