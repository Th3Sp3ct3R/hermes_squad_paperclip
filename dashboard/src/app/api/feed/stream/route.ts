import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timelineEvents } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const AGENT_NAMES = [
  "Michael",
  "Uriel",
  "Zadkiel",
  "Jophiel",
  "Raziel",
  "Raphael",
  "Gabriel",
  "Sandalphon",
  "Metatron",
];

const SYNTHETIC_MESSAGES = [
  { agent: "Michael", text: "Dispatching new issue to pipeline queue" },
  { agent: "Uriel", text: "Sound prompt refined -- sub-bass drone with cathedral IR" },
  { agent: "Zadkiel", text: "Lyrics set to [Instrumental] per vocal policy" },
  { agent: "Jophiel", text: "Cover art prompt generated -- dark monolith, fog, no text" },
  { agent: "Raziel", text: "Suno browser session started for A-side generation" },
  { agent: "Raphael", text: "Reviewing audio variants -- comparing A-side vs B-side" },
  { agent: "Gabriel", text: "Release copy drafted -- caption + hashtags ready" },
  { agent: "Sandalphon", text: "Publisher stage reached -- preparing DistroKid payload" },
  { agent: "Metatron", text: "Timeline checkpoint logged at current epoch" },
  { agent: "Michael", text: "All agents reporting nominal status" },
  { agent: "Uriel", text: "Frequency bias confirmed: low-mid dominant, highs rolled off" },
  { agent: "Raphael", text: "Canon variant selected -- B-side (MiniMax) wins this round" },
  { agent: "Raziel", text: "Browser automation complete -- audio artifact captured" },
  { agent: "Jophiel", text: "Visual generation finished -- 1024x1024 dark palette" },
  { agent: "Gabriel", text: "Hashtag set finalized for release distribution" },
  { agent: "Zadkiel", text: "Chakra resonance locked to THIRD_EYE at 852 Hz" },
  { agent: "Metatron", text: "Activity log compacted -- 47 events archived" },
  { agent: "Sandalphon", text: "DistroKid upload queued -- awaiting confirmation" },
  { agent: "Michael", text: "Pipeline stage advanced: GENERATING -> REVIEW" },
  { agent: "Raphael", text: "Gatekeeper verdict: APPROVED -- advancing to publish" },
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial batch: last 20 events in chronological order
      try {
        const recent = await db
          .select()
          .from(timelineEvents)
          .orderBy(desc(timelineEvents.ts))
          .limit(20);

        const chronological = recent.reverse();

        for (const evt of chronological) {
          const data = JSON.stringify({
            id: evt.id,
            kind: evt.kind,
            agentKey: evt.agentKey,
            text: evt.text,
            meta: evt.meta ? JSON.parse(evt.meta) : null,
            ts: evt.ts,
          });
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
        }
      } catch {
        // DB may be empty; continue to synthetic events
      }

      // Synthetic event loop
      let syntheticId = 100_000;
      const send = () => {
        try {
          const msg =
            SYNTHETIC_MESSAGES[
              randomInt(0, SYNTHETIC_MESSAGES.length - 1)
            ];
          const data = JSON.stringify({
            id: syntheticId++,
            kind: "agent_action",
            agentKey: msg.agent.toLowerCase(),
            text: msg.text,
            meta: null,
            ts: new Date().toISOString(),
          });
          controller.enqueue(
            encoder.encode(`data: ${data}\n\n`)
          );
        } catch {
          // Stream closed by client
          return;
        }

        const delay = randomInt(4000, 7000);
        setTimeout(send, delay);
      };

      // Start synthetic after a short initial delay
      setTimeout(send, randomInt(4000, 7000));
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
