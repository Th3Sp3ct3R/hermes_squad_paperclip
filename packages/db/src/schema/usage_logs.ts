/**
 * Usage logs — records every API call (OpenRouter LLM, MiniMax music,
 * cover-art generation) for cost tracking and dashboard visualization.
 *
 * Indexed on (company_id, created_at) for efficient time-range queries
 * powering the dashboard usage cards.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    /** "openrouter" | "minimax" | "cover-art" */
    provider: text("provider").notNull(),
    /** e.g. "minimax/minimax-m2.5:free", "music-2.6-free" */
    model: text("model").notNull(),
    /** "llm" | "music" | "image" */
    callType: text("call_type").notNull(),
    /** Which pipeline stage triggered this: "soundPrompt", "lyrics", "visualPrompt", "releaseCopy", "musicGen", "coverArt" */
    stage: text("stage"),
    /** Suno issue ID if applicable */
    sunoIssueId: uuid("suno_issue_id"),
    /** Agent ID if applicable */
    agentId: uuid("agent_id"),
    /** Input tokens (LLM calls) */
    tokensIn: integer("tokens_in").default(0),
    /** Output tokens (LLM calls) */
    tokensOut: integer("tokens_out").default(0),
    /** Cached/read tokens */
    tokensCached: integer("tokens_cached").default(0),
    /** Total tokens */
    tokensTotal: integer("tokens_total").default(0),
    /** Cost in cents (if available from provider) */
    costCents: integer("cost_cents").default(0),
    /** Wall-clock duration in ms */
    durationMs: integer("duration_ms").default(0),
    /** HTTP status or provider status code */
    statusCode: integer("status_code"),
    /** true if the call succeeded (1 = yes, 0 = no) */
    success: integer("success").notNull().default(1),
    /** Extra metadata (provider trace ID, error message, etc.) */
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedAtIdx: index("usage_logs_company_created_at_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);
