/**
 * Archangel agent seed data + idempotent insert.
 *
 * Run via:
 *   DATABASE_URL=... pnpm --filter @paperclipai/db tsx src/seeds/run-seed.ts <companyId>
 *
 * The 10 archangels form a celestial hierarchy that runs an autonomous
 * music production pipeline via Suno.com browser automation:
 *   - Michael    : Pipeline Commander (root — reportsTo null)
 *   - Raphael    : Quality Gate / System Health
 *   - Gabriel    : Creative Voice / Release Comms
 *   - Metatron   : Celestial Scribe / Records
 *   - Uriel      : Sound Prompt Engineer
 *   - Jophiel    : Visual Art / Thumbnails / Covers
 *   - Zadkiel    : Poet / Lyricist / Content Creator
 *   - Raziel     : Audio Engineer / CDP Automation
 *   - Sandalphon : Music Delivery (reports to Raziel)
 *   - Cassiel    : Video Montage (reports to Raphael)
 */
import { and, eq } from "drizzle-orm";
import type { createDb } from "../client.js";
import { agents } from "../schema/index.js";

type Db = ReturnType<typeof createDb>;

export interface ArchangelSpec {
  name: string;
  role: string;
  title: string;
  icon: string;
  status: string;
  /** Name of the archangel this one reports to. Null for root (Michael). */
  reportsToName: string | null;
  capabilities: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export const ARCHANGELS: ArchangelSpec[] = [
  {
    name: "Michael",
    role: "commander",
    title: "Pipeline Commander, Dispatch",
    icon: "crown",
    status: "idle",
    reportsToName: null,
    capabilities: "orchestration, dispatch, issue-lifecycle",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Geburah" },
  },
  {
    name: "Raphael",
    role: "diagnostics",
    title: "Quality Gate, System Health",
    icon: "stethoscope",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "quality-check, diagnostics, review",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Tiphareth" },
  },
  {
    name: "Gabriel",
    role: "communications",
    title: "Creative Voice, Release Comms",
    icon: "message-circle",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "social-copy, release-notes, comms",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Yesod" },
  },
  {
    name: "Metatron",
    role: "scribe",
    title: "Celestial Scribe, Records",
    icon: "book-open",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "records, frequency-map-guardian, spec",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Keter" },
  },
  {
    name: "Uriel",
    role: "sound-engineer",
    title: "Sound Prompt Engineer",
    icon: "flame",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "sound-prompt, frequency-mapping, genre-synth",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Netzach" },
  },
  {
    name: "Jophiel",
    role: "visual-artist",
    title: "Visual Art / Thumbnails / Covers",
    icon: "image",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "image-gen, thumbnail, art-direction",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Chokmah" },
  },
  {
    name: "Zadkiel",
    role: "lyricist",
    title: "Poet / Lyricist / Content Creator",
    icon: "pen-tool",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "lyrics, creative-writing, chakra-refs",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Chesed" },
  },
  {
    name: "Raziel",
    role: "audio-engineer",
    title: "Audio Engineer / CDP Automation",
    icon: "headphones",
    status: "idle",
    reportsToName: "Michael",
    capabilities: "browser-automation, cdp, audio-extraction",
    adapterType: "process",
    adapterConfig: { browser: "chrome", cdpPort: 9222 },
    metadata: { archangel: true, choir: 1, sphere: "Chokmah" },
  },
  {
    name: "Sandalphon",
    role: "delivery",
    title: "Music Delivery / Bridges",
    icon: "download",
    status: "idle",
    reportsToName: "Raziel",
    capabilities: "delivery, download, tagging, upload",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 1, sphere: "Malkuth" },
  },
  {
    name: "Cassiel",
    role: "video",
    title: "Video Montage / Motion Design",
    icon: "film",
    status: "idle",
    reportsToName: "Raphael",
    capabilities: "video-composite, ffmpeg, waveform",
    adapterType: "process",
    adapterConfig: {},
    metadata: { archangel: true, choir: 2, sphere: "Binah" },
  },
];

export interface SeedResult {
  inserted: { id: string; name: string }[];
  skipped: { name: string; reason: string }[];
}

/**
 * Seed the 10 archangels for a given company. Idempotent — checks for an
 * existing agent with the same name within the company before inserting.
 *
 * Returns a summary of which archangels were inserted vs skipped.
 */
export async function seedArchangels(db: Db, companyId: string): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], skipped: [] };

  // Pass 1 — insert all archangels with reportsTo=null. We resolve the
  // hierarchy in pass 2 so we don't depend on insertion order.
  const idsByName = new Map<string, string>();
  for (const spec of ARCHANGELS) {
    const existing = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), eq(agents.name, spec.name)))
      .limit(1);

    if (existing.length > 0) {
      idsByName.set(spec.name, existing[0]!.id);
      result.skipped.push({ name: spec.name, reason: "already exists" });
      continue;
    }

    const [row] = await db
      .insert(agents)
      .values({
        companyId,
        name: spec.name,
        role: spec.role,
        title: spec.title,
        icon: spec.icon,
        status: spec.status,
        capabilities: spec.capabilities,
        adapterType: spec.adapterType,
        adapterConfig: spec.adapterConfig,
        metadata: spec.metadata,
      })
      .returning({ id: agents.id, name: agents.name });

    if (row) {
      idsByName.set(row.name, row.id);
      result.inserted.push({ id: row.id, name: row.name });
    }
  }

  // Pass 2 — wire up reportsTo edges now that every archangel has an id.
  for (const spec of ARCHANGELS) {
    if (!spec.reportsToName) continue;
    const childId = idsByName.get(spec.name);
    const parentId = idsByName.get(spec.reportsToName);
    if (!childId || !parentId) continue;

    await db
      .update(agents)
      .set({ reportsTo: parentId, updatedAt: new Date() })
      .where(and(eq(agents.id, childId), eq(agents.companyId, companyId)));
  }

  return result;
}
