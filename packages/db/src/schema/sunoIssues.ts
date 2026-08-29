/**
 * Suno pipeline issues — domain-specific rows for the autonomous music
 * production pipeline. Each row is a song concept moving through the stages:
 *
 *   DRAFT → GENERATING → REVIEW → APPROVED → PUBLISHED
 *                                    ↓
 *                                 FAILED (terminal)
 *
 * Note: chakra and status are stored as plain text (not pgEnum) to mirror the
 * style of the existing `issues.ts` table — text + check is friendlier to
 * Drizzle migrations and matches how `issues.status` and `issues.priority`
 * are modeled. See SUNO_CHAKRAS / SUNO_STATUSES below for the canonical sets.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const SUNO_CHAKRAS = [
  "ROOT",
  "SACRAL",
  "SOLAR",
  "HEART",
  "THROAT",
  "THIRD_EYE",
  "CROWN",
] as const;
export type SunoChakra = (typeof SUNO_CHAKRAS)[number];

/** Solfeggio frequency Hz for each chakra. */
export const SUNO_CHAKRA_FREQUENCIES: Record<SunoChakra, number> = {
  ROOT: 396,
  SACRAL: 417,
  SOLAR: 528,
  HEART: 639,
  THROAT: 741,
  THIRD_EYE: 852,
  CROWN: 963,
};

export const SUNO_STATUSES = [
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "FAILED",
] as const;
export type SunoStatus = (typeof SUNO_STATUSES)[number];

/** Audio variants the issue can hold — A-side Suno + B-side MiniMax. */
export const SUNO_AUDIO_VARIANTS = ["suno", "minimax"] as const;
export type SunoAudioVariant = (typeof SUNO_AUDIO_VARIANTS)[number];

export const sunoIssues = pgTable(
  "suno_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Optional link to a generic issue for unified board views. */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),

    /** The song concept prompt (free-form text — drives lyric + sound work). */
    concept: text("concept").notNull(),
    /** Target chakra (one of SUNO_CHAKRAS). */
    targetChakra: text("target_chakra").notNull(),
    /** Solfeggio frequency in Hz (396, 417, 528, 639, 741, 852, 963). */
    targetFrequency: integer("target_frequency").notNull(),
    /** Free-form genre tag (e.g. "ambient hip-hop", "vaporwave decay"). */
    genre: text("genre"),

    /** The three primary creative leads. All optional during DRAFT. */
    lyricsAgentId: uuid("lyrics_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    soundAgentId: uuid("sound_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    visualAgentId: uuid("visual_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),

    /** Suno's song ID (populated post-generation). */
    sunoSongId: text("suno_song_id"),
    /** Suno-generated audio URL — A-side variant when running A/B. */
    audioUrl: text("audio_url"),
    /** Thumbnail/cover URL — Suno auto-generates, Jophiel can override. */
    thumbnailUrl: text("thumbnail_url"),
    /** Music video URL (Cassiel — late stage). */
    videoUrl: text("video_url"),

    /**
     * MiniMax B-side variant. When auto-run dispatches in option-A parallel
     * mode, both Suno and MiniMax render the same song concept. The two
     * audio outputs sit side-by-side; the human (or Raphael) picks the
     * winner via canonAudioVariant.
     */
    minimaxSongId: text("minimax_song_id"),
    minimaxAudioUrl: text("minimax_audio_url"),
    /** Latest MiniMax base_resp.status_code or null when not yet dispatched. */
    minimaxStatus: integer("minimax_status"),

    /**
     * Which variant is the canonical winner — 'suno' | 'minimax' | null.
     * Sandalphon publishes whichever audioUrl this points at. Null until
     * Raphael / human picks during REVIEW.
     */
    canonAudioVariant: text("canon_audio_variant"),

    /** One of SUNO_STATUSES. Defaults to DRAFT. */
    status: text("status").notNull().default("DRAFT"),

    /** When set while APPROVED, auto-publish ticker will flip to PUBLISHED at this time. */
    scheduledPublishAt: timestamp("scheduled_publish_at", { withTimezone: true }),
    /** When the issue actually transitioned to PUBLISHED (manual or scheduled). */
    publishedAt: timestamp("published_at", { withTimezone: true }),

    /** Future publish targets (e.g. ["internal","youtube","tiktok"]) — reserved for distribution adapters. */
    publishTargets: jsonb("publish_targets").$type<string[] | null>(),

    /** Pipeline stage tracking, lyric drafts, Suno raw responses, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusIdx: index("suno_issues_company_status_idx").on(
      table.companyId,
      table.status,
    ),
    companyChakraIdx: index("suno_issues_company_chakra_idx").on(
      table.companyId,
      table.targetChakra,
    ),
    companyCreatedIdx: index("suno_issues_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    scheduledPublishIdx: index("suno_issues_scheduled_publish_at_idx").on(
      table.scheduledPublishAt,
    ),
    companyScheduledIdx: index("suno_issues_company_scheduled_idx").on(
      table.companyId,
      table.scheduledPublishAt,
    ),
  }),
);

export type SunoIssue = typeof sunoIssues.$inferSelect;
export type NewSunoIssue = typeof sunoIssues.$inferInsert;
