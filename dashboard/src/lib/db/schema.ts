import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  progress: integer("progress").default(0),
  queue: integer("queue").default(0),
  lastEventAt: integer("last_event_at", { mode: "timestamp" }),
  hasShipped: integer("has_shipped", { mode: "boolean" }).default(false),
  firstShipAt: integer("first_ship_at", { mode: "timestamp" }),
});

export const agentEvents = sqliteTable("agent_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agentKey: text("agent_key").notNull(),
  type: text("type").notNull(),
  songId: text("song_id"),
  payload: text("payload"),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
});

export const songs = sqliteTable("songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  chakra: text("chakra").notNull(),
  hz: integer("hz"),
  stage: text("stage").notNull(),
  intent: text("intent"),
  genre: text("genre"),
  durationSec: integer("duration_sec"),
  brainwave: text("brainwave"),
  waveformPeaks: text("waveform_peaks"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  rejectedAt: integer("rejected_at", { mode: "timestamp" }),
  reapprovedAt: integer("reapproved_at", { mode: "timestamp" }),
});

export const listenSessions = sqliteTable("listen_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  songId: text("song_id").notNull(),
  brainwave: text("brainwave").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  durationSec: integer("duration_sec").notNull(),
  deepFocus: integer("deep_focus", { mode: "boolean" }).default(false),
});

export const usageDaily = sqliteTable("usage_daily", {
  date: text("date").primaryKey(),
  tokensIn: integer("tokens_in").default(0),
  tokensOut: integer("tokens_out").default(0),
  cacheReads: integer("cache_reads").default(0),
  cacheHits: integer("cache_hits").default(0),
  apiCalls: integer("api_calls").default(0),
  toolCalls: integer("tool_calls").default(0),
  cost: real("cost").default(0),
  sessions: integer("sessions").default(0),
});

export const modelsUsage = sqliteTable("models_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  model: text("model").notNull(),
  period: text("period").notNull(),
  pctOfCalls: real("pct_of_calls").notNull(),
  sessions: integer("sessions").notNull(),
  tokens: integer("tokens").notNull(),
  cost: real("cost").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(false),
  ctxK: real("ctx_k"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  model: text("model").notNull(),
  msgCount: integer("msg_count").default(0),
  toolCount: integer("tool_count").default(0),
  tokens: integer("tokens").default(0),
  hot: integer("hot", { mode: "boolean" }).default(false),
  highToken: integer("high_token", { mode: "boolean" }).default(false),
  kind: text("kind").default("chat"),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
});

export const skills = sqliteTable("skills", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
});

export const timelineEvents = sqliteTable("timeline_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  agentKey: text("agent_key"),
  text: text("text").notNull(),
  meta: text("meta"),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
});
