import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const allAgents = await db.select().from(agents);
  return NextResponse.json(allAgents);
}
