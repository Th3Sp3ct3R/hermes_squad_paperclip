import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { generateMockPeaks } from "../src/lib/waveform-utils";
import * as s from "../src/lib/db/schema";
import fs from "fs";

const dbPath = "./data.db";
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Create all tables
sqlite.exec(`
  CREATE TABLE agents (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
    status TEXT NOT NULL, progress INTEGER DEFAULT 0, queue INTEGER DEFAULT 0,
    last_event_at INTEGER, has_shipped INTEGER DEFAULT 0, first_ship_at INTEGER
  );
  CREATE TABLE agent_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_key TEXT NOT NULL,
    type TEXT NOT NULL, song_id TEXT, payload TEXT, ts INTEGER NOT NULL
  );
  CREATE TABLE songs (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, chakra TEXT NOT NULL,
    hz INTEGER, stage TEXT NOT NULL, intent TEXT, genre TEXT,
    duration_sec INTEGER, brainwave TEXT, waveform_peaks TEXT,
    created_at INTEGER NOT NULL, published_at INTEGER,
    rejected_at INTEGER, reapproved_at INTEGER
  );
  CREATE TABLE listen_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, song_id TEXT NOT NULL,
    brainwave TEXT NOT NULL, started_at INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL, deep_focus INTEGER DEFAULT 0
  );
  CREATE TABLE usage_daily (
    date TEXT PRIMARY KEY, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0,
    cache_reads INTEGER DEFAULT 0, cache_hits INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0, tool_calls INTEGER DEFAULT 0,
    cost REAL DEFAULT 0, sessions INTEGER DEFAULT 0
  );
  CREATE TABLE models_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT NOT NULL,
    period TEXT NOT NULL, pct_of_calls REAL NOT NULL, sessions INTEGER NOT NULL,
    tokens INTEGER NOT NULL, cost REAL NOT NULL, is_active INTEGER DEFAULT 0,
    ctx_k REAL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, model TEXT NOT NULL,
    msg_count INTEGER DEFAULT 0, tool_count INTEGER DEFAULT 0,
    tokens INTEGER DEFAULT 0, hot INTEGER DEFAULT 0,
    high_token INTEGER DEFAULT 0, kind TEXT DEFAULT 'chat',
    ts INTEGER NOT NULL
  );
  CREATE TABLE skills (
    key TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
    last_run_at INTEGER
  );
  CREATE TABLE timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL,
    agent_key TEXT, text TEXT NOT NULL, meta TEXT, ts INTEGER NOT NULL
  );
`);

const db = drizzle(sqlite, { schema: s });

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

console.log("\u269A Seeding the prima materia\u2026");

// ── AGENTS ─────────────────────────────────────────────────
const agentRows = [
  { key: "metatron",   name: "Metatron",   role: "CELESTIAL SCRIBE", status: "complete",   progress: 100, hasShipped: true,  firstShipAt: daysAgo(12) },
  { key: "michael",    name: "Michael",    role: "COMMANDER",        status: "error",      progress: 0,   hasShipped: true,  firstShipAt: daysAgo(11) },
  { key: "uriel",      name: "Uriel",      role: "SOUND PROMPT",     status: "listening",  progress: 0,   hasShipped: true,  firstShipAt: daysAgo(10) },
  { key: "zadkiel",    name: "Zadkiel",    role: "LYRICIST",         status: "working",    progress: 46,  hasShipped: true,  firstShipAt: daysAgo(9)  },
  { key: "jophiel",    name: "Jophiel",    role: "VISUAL ART",       status: "working",    progress: 74,  hasShipped: true,  firstShipAt: daysAgo(8)  },
  { key: "raziel",     name: "Raziel",     role: "AUDIO ENGINEER",   status: "working",    progress: 38,  hasShipped: true,  firstShipAt: daysAgo(13) },
  { key: "raphael",    name: "Raphael",    role: "REVIEWER",         status: "reviewing",  progress: 62,  hasShipped: true,  firstShipAt: daysAgo(7)  },
  { key: "gabriel",    name: "Gabriel",    role: "RELEASE COPY",     status: "drafting",   progress: 51,  hasShipped: true,  firstShipAt: daysAgo(6)  },
  { key: "sandalphon", name: "Sandalphon", role: "PUBLISHER",        status: "idle",       progress: 0,   queue: 0, hasShipped: true, firstShipAt: daysAgo(5) },
  { key: "cassiel",    name: "Cassiel",    role: "VIDEO",            status: "working",    progress: 62,  hasShipped: true,  firstShipAt: daysAgo(4)  },
  { key: "camael",     name: "Camael",     role: "STANDBY",          status: "standby",    progress: 0,   hasShipped: false },
  { key: "haniel",     name: "Haniel",     role: "STANDBY",          status: "standby",    progress: 0,   hasShipped: false },
  { key: "hermes",     name: "Hermes",     role: "ORCHESTRATOR",     status: "idle",       progress: 0,   hasShipped: true,  firstShipAt: daysAgo(15) },
  { key: "azrael",     name: "Azrael",     role: "ARCHIVIST",        status: "idle",       progress: 0,   hasShipped: false },
  { key: "ariel",      name: "Ariel",      role: "ENV",              status: "idle",       progress: 0,   hasShipped: false },
].map(a => ({ ...a, lastEventAt: minsAgo(Math.floor(Math.random() * 30)) }));
db.insert(s.agents).values(agentRows).run();

// ── SONGS ──────────────────────────────────────────────────
type SongSeed = { id: string; title: string; chakra: string; hz: number; stage: string; genre: string; brainwave: string; durationSec: number; published?: boolean };
const songSeeds: SongSeed[] = [
  { id: "s_crown",  title: "Vessel of the Crown",    chakra: "crown",     hz: 963, stage: "rubedo",     genre: "dark_ambient",    brainwave: "theta", durationSec: 412, published: true },
  { id: "s_heart",  title: "Heartfire Cathedral",    chakra: "heart",     hz: 639, stage: "rubedo",     genre: "neoclassical",    brainwave: "alpha", durationSec: 287, published: true },
  { id: "s_root",   title: "Root & Stone",           chakra: "root",      hz: 396, stage: "rubedo",     genre: "drone",           brainwave: "delta", durationSec: 521, published: true },
  { id: "s_solar",  title: "The Solar Forge",        chakra: "solar",     hz: 528, stage: "citrinitas", genre: "dark_ambient",    brainwave: "beta",  durationSec: 378 },
  { id: "s_sacral", title: "Tide & Womb",            chakra: "sacral",    hz: 417, stage: "albedo",     genre: "lofi",            brainwave: "theta", durationSec: 234 },
  { id: "s_third",  title: "Eye of the Hidden Path", chakra: "third_eye", hz: 852, stage: "nigredo",    genre: "field_recording", brainwave: "alpha", durationSec: 445 },
];
db.insert(s.songs).values(songSeeds.map((seed, idx) => ({
  id: seed.id,
  title: seed.title,
  chakra: seed.chakra,
  hz: seed.hz,
  stage: seed.stage,
  intent: null,
  genre: seed.genre,
  durationSec: seed.durationSec,
  brainwave: seed.brainwave,
  waveformPeaks: JSON.stringify(generateMockPeaks(seed.id, 200)),
  createdAt: daysAgo(20 - idx),
  publishedAt: seed.published ? daysAgo(15 - idx) : null,
  rejectedAt: null,
  reapprovedAt: null,
}))).run();

// ── LISTEN SESSIONS ────────────────────────────────────────
const bandSplit = { theta: 0.62, alpha: 0.21, beta: 0.11, delta: 0.06 };
const listenRows: any[] = [];
for (let d = 0; d < 7; d++) {
  for (const [band, weight] of Object.entries(bandSplit)) {
    const sessionsThisBand = Math.floor(8 * weight) + 1;
    for (let i = 0; i < sessionsThisBand; i++) {
      const songsForBand = songSeeds.filter(x => x.brainwave === band);
      const song = songsForBand[i % songsForBand.length] ?? songSeeds[0]!;
      listenRows.push({
        songId: song.id,
        brainwave: band,
        startedAt: hoursAgo(d * 24 + Math.floor(Math.random() * 18)),
        durationSec: 600 + Math.floor(Math.random() * 1800),
        deepFocus: band === "theta" || (band === "alpha" && Math.random() > 0.4),
      });
    }
  }
}
// Batch insert in chunks of 50
for (let i = 0; i < listenRows.length; i += 50) {
  db.insert(s.listenSessions).values(listenRows.slice(i, i + 50)).run();
}

// ── USAGE DAILY ────────────────────────────────────────────
const usageRows: any[] = [];
for (let d = 30; d >= 0; d--) {
  const peak = (d === 22 || d === 30) ? 12_000_000 : 0;
  const tIn = 200_000 + Math.floor(Math.random() * 500_000) + peak;
  const tOut = Math.floor(tIn * 0.4);
  const cacheReads = Math.floor((tIn + tOut) * 0.6);
  usageRows.push({
    date: daysAgo(d).toISOString().slice(0, 10),
    tokensIn: tIn,
    tokensOut: tOut,
    cacheReads,
    cacheHits: Math.floor(cacheReads * 0.731),
    apiCalls: 8 + Math.floor(Math.random() * 25),
    toolCalls: 5 + Math.floor(Math.random() * 18),
    cost: 0,
    sessions: 3 + Math.floor(Math.random() * 8),
  });
}
db.insert(s.usageDaily).values(usageRows).run();

// ── MODELS USAGE ───────────────────────────────────────────
db.insert(s.modelsUsage).values([
  { model: "Kimi K2.5",         period: "30d", pctOfCalls: 47, sessions: 83, tokens: 6_500_000, cost: 1.31,  isActive: true,  ctxK: 262.1 },
  { model: "Free",              period: "30d", pctOfCalls: 9,  sessions: 3,  tokens: 500_000,   cost: 0.499, isActive: false },
  { model: "Auto",              period: "30d", pctOfCalls: 6,  sessions: 16, tokens: 5_200_000, cost: 0,     isActive: false },
  { model: "Kimi K2.5 (alt)",   period: "30d", pctOfCalls: 5,  sessions: 16, tokens: 5_000_000, cost: 0,     isActive: false },
  { model: "Qwen3.6 Plus:Free", period: "30d", pctOfCalls: 3,  sessions: 2,  tokens: 2_500_000, cost: 0,     isActive: false },
]).run();

// ── SESSIONS ───────────────────────────────────────────────
db.insert(s.sessions).values([
  { id: "sess_cron_aba",      title: "Session cron_aba",                                      model: "Kimi K2.5", msgCount: 0,  toolCount: 0, tokens: 78_600,  hot: true,  highToken: true,  kind: "tool",  ts: minsAgo(180) },
  { id: "sess_what_coding",   title: "what coding model am i using",                          model: "Kimi K2.5", msgCount: 6,  toolCount: 0, tokens: 61_000,  hot: false, highToken: true,  kind: "chat",  ts: hoursAgo(2) },
  { id: "sess_blog_pipeline", title: "[IMPORTANT] User invoked the \"blog-pipeline\" skill",  model: "Kimi K2.5", msgCount: 8,  toolCount: 3, tokens: 72_300,  hot: false, highToken: false, kind: "skill", ts: hoursAgo(2) },
  { id: "sess_session_mem",   title: "[IMPORTANT] User invoked the \"session-memory\" skill", model: "Kimi K2.5", msgCount: 16, toolCount: 7, tokens: 201_500, hot: false, highToken: false, kind: "skill", ts: hoursAgo(4) },
  { id: "sess_suno_canon",    title: "suno_issue.canon_picked",                               model: "local",     msgCount: 4,  toolCount: 0, tokens: 12_400,  hot: false, highToken: false, kind: "local", ts: hoursAgo(6) },
  { id: "sess_theta_mix",     title: "Local Chat \u00b7 theta-mix prompt revisions",           model: "Kimi K2.5", msgCount: 22, toolCount: 0, tokens: 88_200,  hot: false, highToken: false, kind: "chat",  ts: hoursAgo(9) },
]).run();

// ── SKILLS ─────────────────────────────────────────────────
db.insert(s.skills).values([
  { key: "blog-pipeline",  name: "blog-pipeline",  status: "ACTIVE", lastRunAt: minsAgo(45) },
  { key: "session-memory", name: "session-memory", status: "ACTIVE", lastRunAt: minsAgo(80) },
  { key: "audit-cron",     name: "audit-cron",     status: "IDLE",   lastRunAt: hoursAgo(3) },
  { key: "router-gw",      name: "router-gw",      status: "ERR",    lastRunAt: minsAgo(20) },
  { key: "canon-picker",   name: "canon-picker",   status: "DONE",   lastRunAt: hoursAgo(6) },
  { key: "theta-mix",      name: "theta-mix",      status: "IDLE",   lastRunAt: hoursAgo(8) },
]).run();

// ── TIMELINE EVENTS ────────────────────────────────────────
const timelineRows: any[] = [];
const kinds = ["tool_run", "spawn", "error", "recover", "cache", "compress", "index"];
const agentKeys = ["cassiel", "router-gw", "theta-mix", "sandalphon", "metatron", "jophiel", "raziel"];
for (let i = 0; i < 247; i++) {
  timelineRows.push({
    kind: kinds[i % kinds.length]!,
    agentKey: agentKeys[i % agentKeys.length]!,
    text: `event-${i}`,
    meta: null,
    ts: minsAgo(i * 5),
  });
}
for (let i = 0; i < timelineRows.length; i += 50) {
  db.insert(s.timelineEvents).values(timelineRows.slice(i, i + 50)).run();
}

console.log("\u2726 Seeded.");
console.log(`  \u00b7 ${agentRows.length} agents`);
console.log(`  \u00b7 ${songSeeds.length} songs (${songSeeds.filter(x => x.published).length} published)`);
console.log(`  \u00b7 ${listenRows.length} listen sessions`);
console.log(`  \u00b7 ${usageRows.length} usage days`);
console.log(`  \u00b7 ${timelineRows.length} timeline events`);

sqlite.close();
