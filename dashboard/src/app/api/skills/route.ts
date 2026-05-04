import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { skills } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const allSkills = await db.select().from(skills);
  return NextResponse.json(allSkills);
}
