/**
 * Suno pipeline API client. Wraps GET/POST/PATCH /api/suno-pipeline and
 * mirrors the column shape declared in `packages/db/src/schema/sunoIssues.ts`.
 *
 * Frontend types are kept narrow (string for status / chakra) so the UI can
 * iterate without a tight coupling to the DB-types path. The canonical sets
 * live in the server schema and are validated server-side via Zod.
 */
import { api } from "./client";

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

/**
 * Pipeline-stage Kanban columns. The DB only stores 6 statuses; the UI groups
 * them visually. "GENERATING" splits visually into Lyrics+Prompt → Generating
 * → Visuals → Video purely via metadata.stage hints, but persists as a single
 * GENERATING status row. Keep this aligned with the SunoPipeline page below.
 */
export const SUNO_BOARD_COLUMNS = [
  "DRAFT",
  "GENERATING",
  "REVIEW",
  "APPROVED",
  "PUBLISHED",
  "FAILED",
] as const;

export interface SunoIssue {
  id: string;
  companyId: string;
  issueId: string | null;
  concept: string;
  targetChakra: SunoChakra;
  targetFrequency: number;
  genre: string | null;
  lyricsAgentId: string | null;
  soundAgentId: string | null;
  visualAgentId: string | null;
  sunoSongId: string | null;
  audioUrl: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  status: SunoStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSunoIssueInput {
  concept: string;
  targetChakra: SunoChakra;
  targetFrequency?: number;
  genre?: string | null;
  lyricsAgentId?: string | null;
  soundAgentId?: string | null;
  visualAgentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateSunoIssueInput {
  concept?: string;
  targetChakra?: SunoChakra;
  targetFrequency?: number;
  genre?: string | null;
  lyricsAgentId?: string | null;
  soundAgentId?: string | null;
  visualAgentId?: string | null;
  sunoSongId?: string | null;
  audioUrl?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  status?: SunoStatus;
  metadata?: Record<string, unknown>;
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  ) as [string, string][];
  if (entries.length === 0) return path;
  const search = new URLSearchParams(entries).toString();
  return `${path}?${search}`;
}

// ── State machine input shapes (Phase 7) ───────────────────────────────────

export interface AssignInput {
  lyricsAgentId: string;
  soundAgentId: string;
  visualAgentId: string;
}

export const SUNO_DEPOSIT_STAGES = [
  "lyrics",
  "soundPrompt",
  "visualPrompt",
  "releaseCopy",
  "audioUrl",
  "thumbnailUrl",
  "videoUrl",
  "sunoSongId",
  "variants",
  "note",
] as const;
export type SunoDepositStage = (typeof SUNO_DEPOSIT_STAGES)[number];

export interface DepositInput {
  stage: SunoDepositStage;
  /**
   * The work product. URL strings for *Url stages, free-form for lyrics/prompts,
   * structured object for `variants`. Server validates by stage at runtime.
   */
  output: string | number | boolean | unknown[] | Record<string, unknown>;
}

export interface TransitionInput {
  /** Optional human-readable note attached to the transition. */
  note?: string;
}

export interface RejectInput {
  feedback: string;
}

export interface FailInput {
  reason: string;
}

/** A row from the activity log scoped to a single Suno issue. */
export interface SunoTimelineEvent {
  id: string;
  companyId: string;
  actorType: string;
  actorId: string;
  agentId: string | null;
  runId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

const transitionEndpoint = (id: string, verb: string, companyId: string) =>
  withQuery(`/suno-pipeline/${encodeURIComponent(id)}/${verb}`, { companyId });

export const sunoPipelineApi = {
  // ── CRUD ────────────────────────────────────────────────────────────────
  list: (companyId: string) =>
    api.get<SunoIssue[]>(withQuery("/suno-pipeline", { companyId })),
  create: (companyId: string, input: CreateSunoIssueInput) =>
    api.post<SunoIssue>("/suno-pipeline", { companyId, ...input }),
  update: (id: string, companyId: string, input: UpdateSunoIssueInput) =>
    api.patch<SunoIssue>(
      withQuery(`/suno-pipeline/${encodeURIComponent(id)}`, { companyId }),
      { companyId, ...input },
    ),

  // ── State machine (Phase 7) ─────────────────────────────────────────────
  /** Michael assigns the three creative agents. Pre: status === DRAFT. */
  assign: (id: string, companyId: string, input: AssignInput) =>
    api.post<SunoIssue>(transitionEndpoint(id, "assign", companyId), {
      companyId,
      ...input,
    }),
  /** Any creative agent attaches a stage output. Versioned in metadata.history[]. */
  deposit: (id: string, companyId: string, input: DepositInput) =>
    api.post<SunoIssue>(transitionEndpoint(id, "deposit", companyId), {
      companyId,
      ...input,
    }),
  /** Michael: DRAFT → GENERATING. Validates all 3 agents are assigned. */
  dispatch: (id: string, companyId: string, input: TransitionInput = {}) =>
    api.post<SunoIssue>(transitionEndpoint(id, "dispatch", companyId), {
      companyId,
      ...input,
    }),
  /** Creative agent: GENERATING → REVIEW. Validates required outputs exist. */
  requestReview: (id: string, companyId: string, input: TransitionInput = {}) =>
    api.post<SunoIssue>(transitionEndpoint(id, "request-review", companyId), {
      companyId,
      ...input,
    }),
  /** Raphael: REVIEW → APPROVED. */
  approve: (id: string, companyId: string, input: TransitionInput = {}) =>
    api.post<SunoIssue>(transitionEndpoint(id, "approve", companyId), {
      companyId,
      ...input,
    }),
  /** Raphael: REVIEW → GENERATING with feedback. Bumps metadata.iteration. */
  reject: (id: string, companyId: string, input: RejectInput) =>
    api.post<SunoIssue>(transitionEndpoint(id, "reject", companyId), {
      companyId,
      ...input,
    }),
  /** Sandalphon: APPROVED → PUBLISHED. */
  publish: (id: string, companyId: string, input: TransitionInput = {}) =>
    api.post<SunoIssue>(transitionEndpoint(id, "publish", companyId), {
      companyId,
      ...input,
    }),
  /** Any agent: any non-terminal → FAILED with reason. */
  fail: (id: string, companyId: string, input: FailInput) =>
    api.post<SunoIssue>(transitionEndpoint(id, "fail", companyId), {
      companyId,
      ...input,
    }),
  /** Read activity-log rows for this song (used by detail page + Metatron). */
  timeline: (id: string, companyId: string) =>
    api.get<SunoTimelineEvent[]>(
      withQuery(`/suno-pipeline/${encodeURIComponent(id)}/timeline`, { companyId }),
    ),

  // ── AI generation hooks (Phase 8 — OpenRouter) ────────────────────────
  /** Zadkiel: write lyrics from concept + chakra. Result lands in metadata.stages.lyrics. */
  generateLyrics: (id: string, companyId: string, input: GenerateInput = {}) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/lyrics", companyId),
      { companyId, ...input },
    ),
  /** Uriel: synthesize Suno description text. Result lands in metadata.stages.soundPrompt. */
  generateSoundPrompt: (id: string, companyId: string, input: GenerateInput = {}) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/sound-prompt", companyId),
      { companyId, ...input },
    ),
  /** Jophiel: image-gen prompt for cover art. Result lands in metadata.stages.visualPrompt. */
  generateVisualPrompt: (id: string, companyId: string, input: GenerateInput = {}) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/visual-prompt", companyId),
      { companyId, ...input },
    ),
  /** Gabriel: release copy + social caption (parsed JSON). Result in metadata.stages.releaseCopy. */
  generateReleaseCopy: (id: string, companyId: string, input: GenerateInput = {}) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/release-copy", companyId),
      { companyId, ...input },
    ),

  // ── Music generation (Phase 10 — MiniMax music-2.6-free) ──────────────
  /** Server-side music generation via MiniMax. Defaults to music-2.6-free. */
  generateSongViaMinimax: (
    id: string,
    companyId: string,
    input: MinimaxMusicInput = {},
  ) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/song-via-minimax", companyId),
      { companyId, ...input },
    ),

  // ── Cover art generation (Phase 8.5 — Jophiel renders the image) ────
  /**
   * Jophiel renders a cover image from metadata.stages.visualPrompt via
   * OpenRouter image gen. Replaces Suno's auto-generated thumbnailUrl with
   * a custom branded one. Original Suno cover preserved in
   * metadata.previousThumbnails[].
   *
   * Default model: google/gemini-2.5-flash-image (~$0.0004/image, essentially
   * free). Override via input.model or env OPENROUTER_IMAGE_MODEL.
   */
  generateCoverArt: (id: string, companyId: string, input: CoverArtInput = {}) =>
    api.post<SunoIssue>(
      transitionEndpoint(id, "generate/cover-art", companyId),
      { companyId, ...input },
    ),

  // ── Autonomous orchestrator (Phase 9-A) ───────────────────────────────
  /**
   * End-to-end autonomous run. Auto-assigns archangels by name, dispatches,
   * runs the full creative chain (lyrics → soundPrompt → visualPrompt →
   * music → releaseCopy), then transitions to REVIEW.
   *
   * Synchronous — returns ~30–60s after invocation. UI should show a
   * spinner during the call. The returned `missingStages` field is empty
   * when the issue successfully reached REVIEW.
   */
  autoRun: (id: string, companyId: string, input: AutoRunInput = {}) =>
    api.post<AutoRunResult>(transitionEndpoint(id, "auto-run", companyId), {
      companyId,
      ...input,
    }),
};

// ── Phase 8 generation input ───────────────────────────────────────────────

export interface GenerateInput {
  /** Override the default OpenRouter model (e.g. swap to a smaller free model). */
  model?: string;
  /** Optional hints injected into the prompt (mood, BPM, brand voice, etc.). */
  hints?: Record<string, unknown>;
}

// ── Phase 8.5: Cover art (Jophiel image-gen) ───────────────────────────────

export interface CoverArtInput {
  /** Override the default OpenRouter image model. */
  model?: string;
  /** 1:1 default (square cover). Other options: 16:9, 4:3, 9:16, 3:4. */
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16" | "3:4" | "4:5" | "5:4" | string;
  /** "1K" default. Options: "0.5K", "1K", "2K", "4K" (model-dependent). */
  imageSize?: "0.5K" | "1K" | "2K" | "4K" | string;
  /** Override the prompt (defaults to metadata.stages.visualPrompt). */
  prompt?: string;
}

// ── Phase 10: MiniMax music ────────────────────────────────────────────────

export interface MinimaxMusicInput {
  /** Defaults to music-2.6-free (free tier). */
  model?: "music-2.6-free" | "music-2.6" | "music-cover-free" | "music-cover" | string;
  /** Override the prompt that goes into MiniMax (defaults to metadata.stages.soundPrompt). */
  prompt?: string;
  /** Override the lyrics (defaults to metadata.stages.lyrics). */
  lyrics?: string;
  /** Generate an instrumental track. */
  isInstrumental?: boolean;
}

// ── Phase 9-A: Auto-run orchestrator ───────────────────────────────────────

export interface AutoRunInput {
  /** Music backend choice. "minimax" runs server-side. "skip" leaves audio unset. */
  musicBackend?: "minimax" | "skip";
  /** Optional hints applied to ALL prompt builders. */
  hints?: Record<string, unknown>;
}

export interface AutoRunResult {
  issue: SunoIssue;
  readyForReview: boolean;
  /** When readyForReview is false, lists which deposits are still missing. */
  missingStages: string[];
}
