/**
 * Suno pipeline routes — full state machine for the autonomous music production
 * pipeline.
 *
 * CRUD:
 *   GET    /api/suno-pipeline?companyId=...        list issues for a company
 *   POST   /api/suno-pipeline                      create a new pipeline issue
 *   PATCH  /api/suno-pipeline/:id?companyId=...    raw update (manual override)
 *
 * State machine (Phase 7):
 *   POST   /api/suno-pipeline/:id/assign           Michael sets the 3 creative agents
 *   POST   /api/suno-pipeline/:id/deposit          Any agent attaches work output
 *   POST   /api/suno-pipeline/:id/dispatch         Michael: DRAFT → GENERATING
 *   POST   /api/suno-pipeline/:id/request-review   Creative agent: GENERATING → REVIEW
 *   POST   /api/suno-pipeline/:id/approve          Raphael: REVIEW → APPROVED
 *   POST   /api/suno-pipeline/:id/reject           Raphael: REVIEW → GENERATING + feedback
 *   POST   /api/suno-pipeline/:id/publish          Sandalphon: APPROVED → PUBLISHED
 *   POST   /api/suno-pipeline/:id/fail             Any agent: any → FAILED
 *   GET    /api/suno-pipeline/:id/timeline         Read activity log for this song
 *
 * All routes are company-scoped via assertCompanyAccess. Mutations are logged
 * through the standard activity-log pipeline so they show up in the dashboard
 * activity feed and live-event stream.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  sunoIssues,
  agents as agentsTable,
  activityLog,
  goals,
  projects,
  issues,
  companies,
  SUNO_CHAKRAS,
  SUNO_STATUSES,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoStatus,
} from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logActivity, publishLiveEvent } from "../services/index.js";
import { logger } from "../middleware/logger.js";
import {
  buildLyricsPrompt,
  buildSoundPromptPrompt,
  buildVisualPromptPrompt,
  buildReleaseCopyPrompt,
  callOpenRouter,
  SUNO_MODELS,
  type SunoLlmContext,
} from "../services/suno-llm.js";
import { generateCoverArt } from "../services/cover-art-gen.js";
import {
  generateMinimaxMusic,
  MINIMAX_MUSIC_MODELS,
  persistMinimaxAudio,
  persistAudioFromUrl,
  type MinimaxMusicModel,
} from "../services/minimax-music.js";
import { generateViaSuno } from "../services/suno-browser-agent.js";
import {
  parseBatchRequest,
  runWithConcurrency,
  type BatchPlan,
} from "../services/suno-batch.js";
import {
  parseDayPlan,
  CHAKRA_ANGEL,
  type DayPlan,
} from "../services/day-plan.js";
import { withArchangelRun } from "../services/archangel-heartbeat.js";
import {
  buildMiniMaxPrompt,
  MOOD_PRESETS,
  type ChakraKey,
} from "../services/null-angel-identity.js";
import { angelRefine } from "../services/angel-refine.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, forbidden, notFound, unprocessable } from "../errors.js";

// ── Schemas ────────────────────────────────────────────────────────────────

const chakraSchema = z.enum(SUNO_CHAKRAS);
const statusSchema = z.enum(SUNO_STATUSES);

const createSchema = z.object({
  companyId: z.string().uuid(),
  concept: z.string().min(1).max(2000),
  targetChakra: chakraSchema,
  /**
   * Optional override — if not provided we derive from chakra. Useful when an
   * unusual frequency is intended (e.g. detuning experiments).
   */
  targetFrequency: z.number().int().positive().optional(),
  genre: z.string().max(200).nullable().optional(),
  lyricsAgentId: z.string().uuid().nullable().optional(),
  soundAgentId: z.string().uuid().nullable().optional(),
  visualAgentId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  /**
   * companyId may be in either body or query (query is the canonical place
   * for GET-shaped reads, body is friendlier for PATCH). We accept both.
   */
  companyId: z.string().uuid().optional(),
  concept: z.string().min(1).max(2000).optional(),
  targetChakra: chakraSchema.optional(),
  targetFrequency: z.number().int().positive().optional(),
  genre: z.string().max(200).nullable().optional(),
  lyricsAgentId: z.string().uuid().nullable().optional(),
  soundAgentId: z.string().uuid().nullable().optional(),
  visualAgentId: z.string().uuid().nullable().optional(),
  sunoSongId: z.string().nullable().optional(),
  audioUrl: z.string().url().nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  minimaxSongId: z.string().nullable().optional(),
  minimaxAudioUrl: z.string().url().nullable().optional(),
  minimaxStatus: z.number().int().nullable().optional(),
  canonAudioVariant: z.enum(["suno", "minimax"]).nullable().optional(),
  status: statusSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Phase 7 schemas

const assignSchema = z.object({
  companyId: z.string().uuid(),
  lyricsAgentId: z.string().uuid(),
  soundAgentId: z.string().uuid(),
  visualAgentId: z.string().uuid(),
});

const depositStages = [
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

const depositSchema = z.object({
  companyId: z.string().uuid(),
  stage: z.enum(depositStages),
  /** Free-form output — string, url, structured object — depending on stage. */
  output: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown()), z.record(z.unknown())]),
});

const transitionSchema = z.object({
  companyId: z.string().uuid(),
  /** Optional human-readable note attached to the transition. */
  note: z.string().max(2000).optional(),
});

const rejectSchema = z.object({
  companyId: z.string().uuid(),
  feedback: z.string().min(1).max(2000),
});

const failSchema = z.object({
  companyId: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

// Phase 8 — generation hooks (OpenRouter)
const generateSchema = z.object({
  companyId: z.string().uuid(),
  /** Optional override of the default model (e.g. test a different free model). */
  model: z.string().optional(),
  /** Optional hints to inject into the prompt (mood, BPM, brand voice, etc.). */
  hints: z.record(z.unknown()).optional(),
});

// Phase 10 — MiniMax music generation
const minimaxMusicSchema = z.object({
  companyId: z.string().uuid(),
  /** Override the default music model (defaults to music-2.6-free). */
  model: z.string().optional(),
  /** Override the prompt that goes into MiniMax's prompt slot (defaults to metadata.stages.soundPrompt). */
  prompt: z.string().max(2000).optional(),
  /** Override the lyrics (defaults to metadata.stages.lyrics). */
  lyrics: z.string().max(3500).optional(),
  /** Generate an instrumental track. */
  isInstrumental: z.boolean().optional(),
});

// Phase 8.5 — cover-art generation (Jophiel renders the visualPrompt)
const coverArtSchema = z.object({
  companyId: z.string().uuid(),
  /** Override the default OpenRouter image model. */
  model: z.string().optional(),
  /** 1:1 default — square cover matching Suno's format. */
  aspectRatio: z.string().optional(),
  /** "1K" default. Options: 0.5K, 1K, 2K, 4K (model-dependent). */
  imageSize: z.string().optional(),
  /** Override the prompt (defaults to metadata.stages.visualPrompt). */
  prompt: z.string().min(1).max(4000).optional(),
});

// Phase 9-A — autonomous orchestration
const autoRunSchema = z.object({
  companyId: z.string().uuid(),
  /**
   * Music generation backend.
   *   - "minimax"  — server-side MiniMax music API only (free tier)
   *   - "suno"     — Raziel browser automation only (CDP → suno.com/create)
   *   - "parallel" — A/B: MiniMax fires first (faster) + Suno browser
   *                  automation (writes to minimaxAudioUrl and audioUrl
   *                  independently). Raphael picks canonAudioVariant.
   *   - "skip"     — no music gen, leave both url columns null for manual
   */
  musicBackend: z.enum(["minimax", "suno", "skip"]).default("minimax"),
  /** Optional hints applied to ALL prompt builders. */
  hints: z.record(z.unknown()).optional(),
});

const pickCanonSchema = z.object({
  companyId: z.string().uuid(),
  /** Which audio variant becomes the canonical winner. Null clears the pick. */
  variant: z.enum(["suno", "minimax"]).nullable(),
});

const dispatchMinimaxSchema = z.object({
  companyId: z.string().uuid(),
  /** Override the prompt that goes to MiniMax (defaults to metadata.stages.soundPrompt). */
  prompt: z.string().min(1).max(2000).optional(),
  /** Override lyrics (defaults to metadata.stages.lyrics). */
  lyrics: z.string().min(1).max(3500).optional(),
  /** Model override — defaults to music-2.6-free. */
  model: z.string().optional(),
  /** Generate an instrumental track (skips lyrics requirement). */
  isInstrumental: z.boolean().optional(),
});

const dispatchSunoSchema = z.object({
  companyId: z.string().uuid(),
  /** Override the prompt (defaults to metadata.stages.soundPrompt). */
  prompt: z.string().min(1).max(2000).optional(),
});

/** Angel Refine — ruling angel LLM-refines user's free-text into a structured concept. */
const angelRefineSchema = z.object({
  companyId: z.string().uuid(),
  chakra: chakraSchema,
  rulingAngel: z.string().min(1),
  userInput: z.string().min(1).max(2000),
  presetId: z.string().optional(),
  presetConcept: z.string().max(2000).optional(),
  presetGenre: z.string().max(400).optional(),
});

/** Phase 10 — Day-plan ritual (Hermes asks the user about their day, prescribes
 *  a multi-block frequency progression, then materializes one batch per block). */
const dayPlanParseSchema = z.object({
  companyId: z.string().uuid(),
  /** Free-text description of the day's tasks. */
  request: z.string().min(3).max(2000),
});

const dayPlanCreateSchema = z.object({
  companyId: z.string().uuid(),
  /** A previously-parsed plan (from /day-plan/parse) the user has confirmed. */
  plan: z.object({
    request: z.string(),
    totalDurationMinutes: z.number(),
    hostGreeting: z.string().optional(),
    hostSummary: z.string().optional(),
    blocks: z
      .array(
        z.object({
          label: z.string().min(1).max(160),
          durationMinutes: z.number().positive(),
          targetChakra: chakraSchema,
          targetFrequency: z.number().int().positive(),
          genre: z.string(),
          masterSoundPrompt: z.string().min(1).max(2000),
          rationale: z.string().optional(),
        }),
      )
      .min(1)
      .max(20),
  }),
  /** Cap the song count per block. Default 50 — enough for a 3-hour block. */
  maxSongsPerBlock: z.number().int().min(1).max(200).optional(),
});

/** Phase 9 — NLP batch generation ("10 hours of deep focus music" → N issues). */
const batchParseSchema = z.object({
  companyId: z.string().uuid(),
  request: z.string().min(3).max(2000),
  /** Cap song count even if the LLM/duration math suggests more. Defaults 200. */
  maxSongCount: z.number().int().min(1).max(500).optional(),
});

const batchCreateSchema = z.object({
  companyId: z.string().uuid(),
  /** Either pass a plan directly (after /batch/parse) OR a request to parse fresh. */
  plan: z
    .object({
      request: z.string(),
      totalDurationMinutes: z.number(),
      songCount: z.number().int().min(1),
      averageSongMinutes: z.number(),
      targetChakra: chakraSchema,
      targetFrequency: z.number().int().positive(),
      genre: z.string(),
      masterConcept: z.string(),
      masterSoundPrompt: z.string(),
      variations: z
        .array(
          z.object({
            title: z.string().min(1).max(120),
            concept: z.string().min(1).max(300),
            soundPrompt: z.string().min(1).max(2000),
          }),
        )
        .min(1)
        .max(500),
    })
    .optional(),
  request: z.string().min(3).max(2000).optional(),
  maxSongCount: z.number().int().min(1).max(500).optional(),
});

const batchExecuteSchema = z.object({
  companyId: z.string().uuid(),
  /** Backend per song. Default "minimax" (fast, server-side, no Chrome dep). */
  musicBackend: z.enum(["minimax", "suno"]).default("minimax"),
  /** Max concurrent generations. Default 5. Suno backend forces 1 (browser bound). */
  concurrency: z.number().int().min(1).max(20).default(5),
});

/**
 * Bulk-import a song that was generated outside paperclip (e.g. directly on
 * suno.com or via the CDP browser test harness). Creates a new sunoIssue,
 * downloads each variant from the given Suno CDN URL, persists the bytes
 * via paperclip's storage so the audio survives third-party CDN changes,
 * and writes the standard pipeline metadata so downstream agents (Jophiel
 * cover-art, Gabriel release copy, Sandalphon publish) can pick it up.
 */
const importSunoSchema = z.object({
  companyId: z.string().uuid(),
  concept: z.string().min(1).max(2000),
  targetChakra: chakraSchema,
  targetFrequency: z.number().int().positive().optional(),
  genre: z.string().max(200).nullable().optional(),
  /**
   * Sound-prompt that produced these variants. Stored in
   * metadata.stages.soundPrompt so /generate/visual-prompt and
   * /generate/cover-art can run against the imported issue.
   */
  soundPrompt: z.string().min(1).max(2000),
  variants: z
    .array(
      z.object({
        sunoSongId: z.string().min(1),
        sunoUrl: z.string().url(),
        title: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(8),
});

// ── Helpers ────────────────────────────────────────────────────────────────

function resolveCompanyId(req: {
  query: Record<string, unknown>;
  body?: Record<string, unknown> | null;
}): string {
  const fromQuery =
    typeof req.query.companyId === "string" ? req.query.companyId : null;
  // GET requests have no body — express.json() leaves req.body undefined.
  const body = req.body ?? null;
  const fromBody =
    body && typeof body.companyId === "string" ? (body.companyId as string) : null;
  const companyId = fromQuery ?? fromBody;
  if (!companyId) {
    throw badRequest("companyId is required (query string or body)");
  }
  return companyId;
}

function paramId(req: { params: Record<string, unknown> }): string {
  const raw = req.params.id;
  if (typeof raw !== "string" || !raw) {
    throw badRequest("id is required");
  }
  return raw;
}

interface HistoryEntry {
  stage: string;
  output: unknown;
  at: string;
  actorType: string;
  actorId: string;
  agentId: string | null;
  agentName: string | null;
  status: SunoStatus;
}

function appendHistory(
  metadata: Record<string, unknown> | null | undefined,
  entry: HistoryEntry,
): Record<string, unknown> {
  const current = (metadata && typeof metadata === "object" ? metadata : {}) as Record<
    string,
    unknown
  >;
  const history = Array.isArray(current.history) ? [...(current.history as unknown[])] : [];
  history.push(entry as unknown);
  return { ...current, history };
}

/**
 * Look up the calling agent's name when the actor is an agent. Used to enforce
 * role-locked transitions (Raphael for approve/reject, Sandalphon for publish).
 * Returns null when the actor is a board user (their permissions are checked
 * separately by assertCompanyAccess).
 */
async function resolveActorAgentName(db: Db, req: Request): Promise<string | null> {
  if (req.actor.type !== "agent" || !req.actor.agentId) return null;
  const [row] = await db
    .select({ name: agentsTable.name })
    .from(agentsTable)
    .where(eq(agentsTable.id, req.actor.agentId))
    .limit(1);
  return row?.name ?? null;
}

/** Validate a state transition; throws 422 if not allowed. */
function assertTransition(from: SunoStatus, to: SunoStatus, allowed: SunoStatus[]): void {
  if (!allowed.includes(from)) {
    throw unprocessable(
      `Invalid transition: cannot ${to} from ${from} (allowed sources: ${allowed.join(", ")})`,
    );
  }
}

// ── Route factory ──────────────────────────────────────────────────────────

export function sunoPipelineRoutes(db: Db) {
  const router = Router();

  /** Load + ownership-check a song. Throws 404 if not found. */
  async function loadIssueOrThrow(id: string, companyId: string) {
    const [row] = await db
      .select()
      .from(sunoIssues)
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, companyId)))
      .limit(1);
    if (!row) throw notFound("Suno issue not found");
    return row;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Unified hierarchy promotion (option C) — every sunoIssue is also a real
  // `issues` row under a "Music Orchestra" project under a "Songs" goal, so
  // songs show up everywhere the rest of the work tracking does (Issues
  // board, project pages, Hermes Feed, TASKS.md, etc.).
  // ────────────────────────────────────────────────────────────────────────

  const MUSIC_GOAL_NAME = "Songs";
  const MUSIC_PROJECT_NAME = "Music Orchestra";

  /** Map sunoIssue status → canonical issue status (ALL_ISSUE_STATUSES). */
  function mapSunoToIssueStatus(s: SunoStatus): string {
    switch (s) {
      case "DRAFT":      return "backlog";
      case "GENERATING": return "in_progress";
      case "REVIEW":     return "in_review";
      case "APPROVED":   return "in_review";
      case "PUBLISHED":  return "done";
      case "FAILED":     return "cancelled";
      default:           return "backlog";
    }
  }

  /**
   * Idempotently fetch (or create) the company's default Music goal +
   * project. Returns { goalId, projectId } both guaranteed non-null.
   */
  async function ensureMusicProjectAndGoal(
    companyId: string,
  ): Promise<{ goalId: string; projectId: string }> {
    // 1. Goal — a single canonical "Songs" goal per company.
    //    goals uses `title` (not name) and has no metadata column.
    const [existingGoal] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.companyId, companyId), eq(goals.title, MUSIC_GOAL_NAME)))
      .limit(1);

    let goalId = existingGoal?.id;
    if (!goalId) {
      const [newGoal] = await db
        .insert(goals)
        .values({
          companyId,
          title: MUSIC_GOAL_NAME,
          status: "in_progress",
          description: "Songs shipped by the autonomous music orchestra (Suno + MiniMax pipeline).",
        })
        .returning({ id: goals.id });
      goalId = newGoal!.id;
    }

    // 2. Project — "Music Orchestra" under the Songs goal.
    const [existingProject] = await db
      .select({ id: projects.id, goalId: projects.goalId })
      .from(projects)
      .where(
        and(eq(projects.companyId, companyId), eq(projects.name, MUSIC_PROJECT_NAME)),
      )
      .limit(1);

    let projectId = existingProject?.id;
    if (!projectId) {
      const [newProject] = await db
        .insert(projects)
        .values({
          companyId,
          goalId,
          name: MUSIC_PROJECT_NAME,
          description:
            "Songs flowing through the Suno pipeline. Each issue here is a song concept tracked end-to-end (DRAFT → PUBLISHED).",
          status: "in_progress",
        })
        .returning({ id: projects.id });
      projectId = newProject!.id;
    } else if (!existingProject.goalId || existingProject.goalId !== goalId) {
      // Backfill goalId on the project if missing or stale.
      await db
        .update(projects)
        .set({ goalId })
        .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
    }

    return { goalId, projectId };
  }

  /**
   * Compose a short title + structured description for the parent issue
   * from a sunoIssue. Title caps at 100 chars to fit the Issues board well.
   */
  function buildIssueShellFromSuno(
    suno: typeof sunoIssues.$inferSelect,
  ): { title: string; description: string } {
    const titleSeed = suno.concept.split("\n")[0]?.trim() ?? suno.concept;
    const title = titleSeed.length > 100 ? `${titleSeed.slice(0, 99)}…` : titleSeed;
    const lines = [
      `♪ ${suno.targetChakra} · ${suno.targetFrequency} Hz Solfeggio carrier`,
      suno.genre ? `Genre: ${suno.genre}` : null,
      "",
      "Concept:",
      suno.concept,
    ].filter((l): l is string => l !== null);
    return { title, description: lines.join("\n") };
  }

  /**
   * Create a parent issue for a freshly-created sunoIssue and link it back
   * via sunoIssues.issueId. Allocates an issueNumber atomically from the
   * company. Best-effort: if the link fails, returns null and the suno_issue
   * remains unlinked rather than blocking creation.
   */
  async function createLinkedIssueForSuno(
    suno: typeof sunoIssues.$inferSelect,
    actorIds: { agentId: string | null; userId: string | null },
  ): Promise<string | null> {
    try {
      const { goalId, projectId } = await ensureMusicProjectAndGoal(suno.companyId);
      const shell = buildIssueShellFromSuno(suno);

      // Allocate an issueNumber atomically.
      const [company] = await db
        .update(companies)
        .set({ issueCounter: sql`${companies.issueCounter} + 1` })
        .where(eq(companies.id, suno.companyId))
        .returning({
          issueCounter: companies.issueCounter,
          issuePrefix: companies.issuePrefix,
        });
      if (!company) return null;

      const issueNumber = company.issueCounter;
      const identifier = `${company.issuePrefix}-${issueNumber}`;

      const [issueRow] = await db
        .insert(issues)
        .values({
          companyId: suno.companyId,
          projectId,
          goalId,
          title: shell.title,
          description: shell.description,
          status: mapSunoToIssueStatus(suno.status as SunoStatus),
          priority: "medium",
          // Lyrics agent makes a reasonable default assignee — falls back
          // to sound, then visual, then null. Michael is intentionally NOT
          // the default since the song is doing the actual creative work.
          assigneeAgentId:
            suno.lyricsAgentId ?? suno.soundAgentId ?? suno.visualAgentId ?? null,
          createdByAgentId: actorIds.agentId,
          createdByUserId: actorIds.userId,
          issueNumber,
          identifier,
        })
        .returning({ id: issues.id });

      const newIssueId = issueRow?.id ?? null;
      if (!newIssueId) return null;

      // Link the suno_issue back to the new issue.
      await db
        .update(sunoIssues)
        .set({ issueId: newIssueId, updatedAt: new Date() })
        .where(
          and(eq(sunoIssues.id, suno.id), eq(sunoIssues.companyId, suno.companyId)),
        );

      return newIssueId;
    } catch (err) {
      // Don't break suno creation if the unified-hierarchy link fails.
      // eslint-disable-next-line no-console
      console.error("[suno-pipeline] Failed to create linked issue:", err);
      return null;
    }
  }

  /**
   * Mirror a sunoIssue status change to its linked issue (if any). Best-effort.
   * Keeps the unified board accurate without blocking the suno transition.
   */
  async function syncLinkedIssueStatus(
    suno: typeof sunoIssues.$inferSelect,
    nextSunoStatus: SunoStatus,
  ): Promise<void> {
    if (!suno.issueId) return;
    const nextIssueStatus = mapSunoToIssueStatus(nextSunoStatus);
    try {
      const setPatch: Record<string, unknown> = {
        status: nextIssueStatus,
        updatedAt: new Date(),
      };
      if (nextIssueStatus === "in_progress") setPatch.startedAt = new Date();
      if (nextIssueStatus === "done") setPatch.completedAt = new Date();
      if (nextIssueStatus === "cancelled") setPatch.cancelledAt = new Date();
      await db
        .update(issues)
        .set(setPatch)
        .where(and(eq(issues.id, suno.issueId), eq(issues.companyId, suno.companyId)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[suno-pipeline] Failed to mirror status to linked issue:", err);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  //   CRUD
  // ────────────────────────────────────────────────────────────────────────

  // ── GET /suno-pipeline/presets ────────────────────────────────────────────
  // Returns mood presets for the one-click beat generation UI.
  router.get("/suno-pipeline/presets", (_req, res) => {
    // Import is at the top of the file already (MOOD_PRESETS)
    res.json(MOOD_PRESETS);
  });

  // ── GET /suno-pipeline ────────────────────────────────────────────────────
  router.get("/suno-pipeline", async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      assertCompanyAccess(req, companyId);

      const rows = await db
        .select()
        .from(sunoIssues)
        .where(eq(sunoIssues.companyId, companyId))
        .orderBy(asc(sunoIssues.createdAt));

      res.json(rows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[suno-pipeline] GET failed:", err);
      throw err;
    }
  });

  // ── POST /suno-pipeline ───────────────────────────────────────────────────
  router.post("/suno-pipeline", validate(createSchema), async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    assertCompanyAccess(req, body.companyId);

    const targetFrequency =
      body.targetFrequency ?? SUNO_CHAKRA_FREQUENCIES[body.targetChakra];

    const [row] = await db
      .insert(sunoIssues)
      .values({
        companyId: body.companyId,
        concept: body.concept,
        targetChakra: body.targetChakra,
        targetFrequency,
        genre: body.genre ?? null,
        lyricsAgentId: body.lyricsAgentId ?? null,
        soundAgentId: body.soundAgentId ?? null,
        visualAgentId: body.visualAgentId ?? null,
        metadata: body.metadata ?? {},
        status: "DRAFT",
      })
      .returning();

    if (!row) throw badRequest("Failed to create suno issue");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.created",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        concept: row.concept,
        targetChakra: row.targetChakra,
        targetFrequency: row.targetFrequency,
        status: row.status,
      },
    });

    // Option C — auto-promote to the unified Goal/Project/Issue tree.
    // Creates "Songs" goal + "Music Orchestra" project on first song,
    // then a backlog issue linked back via sunoIssues.issueId. Failures
    // here don't block creation (the suno_issue still exists).
    const linkedIssueId = await createLinkedIssueForSuno(row, {
      agentId: actor.agentId,
      userId: actor.actorType === "user" ? actor.actorId : null,
    });

    if (linkedIssueId) {
      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.linked_to_issue",
        entityType: "suno_issue",
        entityId: row.id,
        details: { issueId: linkedIssueId },
      });
    }

    // Re-fetch so the response includes the freshly-set issueId.
    const final = linkedIssueId
      ? (await loadIssueOrThrow(row.id, body.companyId))
      : row;
    res.status(201).json(final);
  });

  // ── PATCH /suno-pipeline/:id ──────────────────────────────────────────────
  router.patch("/suno-pipeline/:id", validate(updateSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof updateSchema>;
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const existing = await loadIssueOrThrow(id, companyId);

    // Build a delta of just the fields the caller actually sent.
    const patch: Partial<typeof sunoIssues.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.concept !== undefined) patch.concept = body.concept;
    if (body.targetChakra !== undefined) {
      patch.targetChakra = body.targetChakra;
      // If the chakra changes and the caller didn't pin a frequency, retune.
      if (body.targetFrequency === undefined) {
        patch.targetFrequency = SUNO_CHAKRA_FREQUENCIES[body.targetChakra];
      }
    }
    if (body.targetFrequency !== undefined) patch.targetFrequency = body.targetFrequency;
    if (body.genre !== undefined) patch.genre = body.genre;
    if (body.lyricsAgentId !== undefined) patch.lyricsAgentId = body.lyricsAgentId;
    if (body.soundAgentId !== undefined) patch.soundAgentId = body.soundAgentId;
    if (body.visualAgentId !== undefined) patch.visualAgentId = body.visualAgentId;
    if (body.sunoSongId !== undefined) patch.sunoSongId = body.sunoSongId;
    if (body.audioUrl !== undefined) patch.audioUrl = body.audioUrl;
    if (body.thumbnailUrl !== undefined) patch.thumbnailUrl = body.thumbnailUrl;
    if (body.videoUrl !== undefined) patch.videoUrl = body.videoUrl;
    if (body.minimaxSongId !== undefined) patch.minimaxSongId = body.minimaxSongId;
    if (body.minimaxAudioUrl !== undefined) patch.minimaxAudioUrl = body.minimaxAudioUrl;
    if (body.minimaxStatus !== undefined) patch.minimaxStatus = body.minimaxStatus;
    if (body.canonAudioVariant !== undefined) patch.canonAudioVariant = body.canonAudioVariant;
    if (body.status !== undefined) patch.status = body.status;
    if (body.metadata !== undefined) patch.metadata = body.metadata;

    const [row] = await db
      .update(sunoIssues)
      .set(patch)
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    // Mirror status to linked issue if it changed.
    if (body.status !== undefined && body.status !== existing.status) {
      await syncLinkedIssueStatus(row, body.status);
    }

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.updated",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        previousStatus: existing.status,
        newStatus: row.status,
        changedFields: Object.keys(body).filter((k) => k !== "companyId"),
      },
    });

    res.json(row);
  });

  // ── DELETE /suno-pipeline/:id ─────────────────────────────────────────────
  // Hard-delete a track. Not recoverable. FAILED is the soft-delete equivalent
  // — use this only when the user explicitly wants to dissolve a working.
  router.delete("/suno-pipeline/:id", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);
    const { id } = req.params;

    const [existing] = await db
      .select()
      .from(sunoIssues)
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, companyId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await db.delete(sunoIssues).where(eq(sunoIssues.id, id));

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.deleted",
      entityType: "suno_issue",
      entityId: id,
      details: {
        concept: existing.concept,
        status: existing.status,
        targetChakra: existing.targetChakra,
      },
    });

    res.status(204).end();
  });

  // ── POST /suno-pipeline/bulk-transition ────────────────────────────────────
  // Move multiple tracks to a target status in one call. Used for unsticking
  // tracks stuck in GENERATING or bulk-dissolving FAILED tracks.
  const bulkTransitionSchema = z.object({
    body: z.object({
      companyId: z.string().uuid(),
      ids: z.array(z.string().uuid()).min(1).max(200),
      targetStatus: z.enum(["DRAFT", "GENERATING", "REVIEW", "APPROVED", "PUBLISHED", "FAILED"]),
      reason: z.string().optional(),
    }),
  });
  router.post("/suno-pipeline/bulk-transition", validate(bulkTransitionSchema), async (req, res) => {
    const { companyId, ids, targetStatus, reason } = req.body as z.infer<typeof bulkTransitionSchema>["body"];
    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({ id: sunoIssues.id, status: sunoIssues.status })
      .from(sunoIssues)
      .where(and(eq(sunoIssues.companyId, companyId), inArray(sunoIssues.id, ids)));

    const validIds = rows.map((r) => r.id);
    if (validIds.length === 0) {
      res.status(404).json({ error: "No matching tracks found" });
      return;
    }

    await db
      .update(sunoIssues)
      .set({
        status: targetStatus as SunoStatus,
        updatedAt: new Date(),
        metadata: sql`jsonb_set(
          COALESCE(${sunoIssues.metadata}, '{}'),
          '{bulkTransition}',
          ${JSON.stringify({ at: new Date().toISOString(), targetStatus, reason: reason ?? null })}::jsonb
        )`,
      })
      .where(inArray(sunoIssues.id, validIds));

    const actor = getActorInfo(req);
    for (const row of rows) {
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.bulk_transition",
        entityType: "suno_issue",
        entityId: row.id,
        details: {
          previousStatus: row.status,
          targetStatus,
          reason: reason ?? null,
        },
      });
    }

    res.json({ transitioned: validIds.length, ids: validIds });
  });

  // ── POST /suno-pipeline/backfill-issues ───────────────────────────────────
  // One-time admin op (idempotent): find sunoIssues with no linked issue
  // and create one for each. Used for songs created BEFORE option C landed,
  // or to re-sync after a manual schema change.
  router.post("/suno-pipeline/backfill-issues", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const unlinked = await db
      .select()
      .from(sunoIssues)
      .where(and(eq(sunoIssues.companyId, companyId), sql`${sunoIssues.issueId} IS NULL`))
      .orderBy(asc(sunoIssues.createdAt));

    const actor = getActorInfo(req);
    const results: Array<{ sunoIssueId: string; issueId: string | null }> = [];
    for (const suno of unlinked) {
      const issueId = await createLinkedIssueForSuno(suno, {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      });
      results.push({ sunoIssueId: suno.id, issueId });
    }

    const linkedCount = results.filter((r) => r.issueId).length;
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_pipeline.backfilled_issues",
      entityType: "company",
      entityId: companyId,
      details: { totalUnlinked: unlinked.length, linkedCount },
    });

    res.json({ totalUnlinked: unlinked.length, linkedCount, results });
  });

  // ────────────────────────────────────────────────────────────────────────
  //   STATE MACHINE (Phase 7)
  // ────────────────────────────────────────────────────────────────────────

  // ── POST /:id/assign ──────────────────────────────────────────────────────
  // Michael sets the three creative agents. Pre-condition: status === DRAFT.
  router.post("/suno-pipeline/:id/assign", validate(assignSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof assignSchema>;
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);
    if (existing.status !== "DRAFT") {
      throw unprocessable(
        `Cannot assign agents on a ${existing.status} issue; only DRAFT issues accept assignments.`,
      );
    }

    const [row] = await db
      .update(sunoIssues)
      .set({
        lyricsAgentId: body.lyricsAgentId,
        soundAgentId: body.soundAgentId,
        visualAgentId: body.visualAgentId,
        updatedAt: new Date(),
      })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.assigned",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        lyricsAgentId: body.lyricsAgentId,
        soundAgentId: body.soundAgentId,
        visualAgentId: body.visualAgentId,
      },
    });

    res.json(row);
  });

  // ── POST /:id/deposit ─────────────────────────────────────────────────────
  // Any creative agent attaches a stage output (lyrics / soundPrompt /
  // visualPrompt / releaseCopy / audioUrl / thumbnailUrl / videoUrl /
  // sunoSongId / variants / note). Versioned trail in metadata.history[].
  router.post("/suno-pipeline/:id/deposit", validate(depositSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof depositSchema>;
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);
    if (existing.status === "PUBLISHED" || existing.status === "FAILED") {
      throw unprocessable(
        `Cannot deposit on a ${existing.status} issue (terminal state).`,
      );
    }

    const actor = getActorInfo(req);
    const agentName = await resolveActorAgentName(db, req);

    // Snapshot top-level fields when the deposit aliases one (audioUrl,
    // thumbnailUrl, videoUrl, sunoSongId). Other stages live only in metadata.
    const topLevelPatch: Partial<typeof sunoIssues.$inferInsert> = { updatedAt: new Date() };
    if (body.stage === "audioUrl" && typeof body.output === "string") {
      topLevelPatch.audioUrl = body.output;
    } else if (body.stage === "thumbnailUrl" && typeof body.output === "string") {
      topLevelPatch.thumbnailUrl = body.output;
    } else if (body.stage === "videoUrl" && typeof body.output === "string") {
      topLevelPatch.videoUrl = body.output;
    } else if (body.stage === "sunoSongId" && typeof body.output === "string") {
      topLevelPatch.sunoSongId = body.output;
    }

    // Build the new metadata with appended history + a per-stage cache so
    // readers don't have to walk history to find the current value.
    const currentMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    const stageCache = (currentMeta.stages && typeof currentMeta.stages === "object"
      ? { ...(currentMeta.stages as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    stageCache[body.stage] = body.output;

    const nextMeta = appendHistory(
      { ...currentMeta, stages: stageCache },
      {
        stage: body.stage,
        output: body.output,
        at: new Date().toISOString(),
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        agentName,
        status: existing.status as SunoStatus,
      },
    );

    const [row] = await db
      .update(sunoIssues)
      .set({ ...topLevelPatch, metadata: nextMeta })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.deposited",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        stage: body.stage,
        agentName,
        // Don't redact lyrics/prompts in the activity log details — those
        // ARE the work product. logActivity's sanitizer handles secrets.
        outputType: typeof body.output,
        outputSize: typeof body.output === "string" ? body.output.length : undefined,
      },
    });

    res.json(row);
  });

  // ── POST /:id/dispatch ────────────────────────────────────────────────────
  // Michael moves DRAFT → GENERATING. Validates all three creative agents
  // are assigned.
  router.post("/suno-pipeline/:id/dispatch", validate(transitionSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof transitionSchema>;
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);
    assertTransition(existing.status as SunoStatus, "GENERATING", ["DRAFT"]);

    const missing: string[] = [];
    if (!existing.lyricsAgentId) missing.push("lyricsAgentId");
    if (!existing.soundAgentId) missing.push("soundAgentId");
    if (!existing.visualAgentId) missing.push("visualAgentId");
    if (missing.length > 0) {
      throw unprocessable(
        `Cannot dispatch: missing assignment(s) ${missing.join(", ")}. Call /assign first.`,
      );
    }

    const [row] = await db
      .update(sunoIssues)
      .set({ status: "GENERATING", updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    // Mirror to linked issue (option C unified hierarchy).
    await syncLinkedIssueStatus(row, "GENERATING");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.dispatched",
      entityType: "suno_issue",
      entityId: row.id,
      details: { previousStatus: existing.status, newStatus: row.status, note: body.note ?? null },
    });

    res.json(row);
  });

  // ── POST /:id/request-review ──────────────────────────────────────────────
  // Any creative agent moves GENERATING → REVIEW after depositing all required
  // outputs. Per Phase 7 decisions: ALL THREE creative outputs required
  // (lyrics + soundPrompt + visualPrompt) plus an audioUrl.
  router.post(
    "/suno-pipeline/:id/request-review",
    validate(transitionSchema),
    async (req, res) => {
      const id = paramId(req);
      const body = req.body as z.infer<typeof transitionSchema>;
      assertCompanyAccess(req, body.companyId);

      const existing = await loadIssueOrThrow(id, body.companyId);
      assertTransition(existing.status as SunoStatus, "REVIEW", ["GENERATING"]);

      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;

      const missing: string[] = [];
      if (!stages.lyrics) missing.push("lyrics");
      if (!stages.soundPrompt) missing.push("soundPrompt");
      if (!stages.visualPrompt) missing.push("visualPrompt");
      if (!existing.audioUrl) missing.push("audioUrl");
      if (missing.length > 0) {
        throw unprocessable(
          `Cannot request review: missing ${missing.join(", ")}. Deposit them first.`,
        );
      }

      const [row] = await db
        .update(sunoIssues)
        .set({ status: "REVIEW", updatedAt: new Date() })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!row) throw notFound("Suno issue not found");

      await syncLinkedIssueStatus(row, "REVIEW");

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.review_requested",
        entityType: "suno_issue",
        entityId: row.id,
        details: { previousStatus: existing.status, newStatus: row.status, note: body.note ?? null },
      });

      res.json(row);
    },
  );

  // ── POST /:id/approve ─────────────────────────────────────────────────────
  // Raphael moves REVIEW → APPROVED. Locked to Raphael by agent name when
  // the actor is an agent; board users (humans) bypass the role check —
  // they're authorized via standard company-access permissions.
  router.post("/suno-pipeline/:id/approve", validate(transitionSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof transitionSchema>;
    assertCompanyAccess(req, body.companyId);

    const agentName = await resolveActorAgentName(db, req);
    if (req.actor.type === "agent" && agentName !== "Raphael") {
      throw forbidden(
        `Only Raphael can approve Suno issues (calling agent: ${agentName ?? "unknown"})`,
      );
    }

    const existing = await loadIssueOrThrow(id, body.companyId);
    assertTransition(existing.status as SunoStatus, "APPROVED", ["REVIEW"]);

    const [row] = await db
      .update(sunoIssues)
      .set({ status: "APPROVED", updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await syncLinkedIssueStatus(row, "APPROVED");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.approved",
      entityType: "suno_issue",
      entityId: row.id,
      details: { previousStatus: existing.status, newStatus: row.status, note: body.note ?? null },
    });

    res.json(row);
  });

  // ── POST /bulk-approve ────────────────────────────────────────────────────
  // Move many REVIEW issues to APPROVED in one request. Used to clear
  // backlog when Raphael isn't running autonomously, and as the natural
  // exit gate for batch-generated songs once the user has spot-checked.
  // Subject to the same Raphael agent-name lock as /:id/approve, but
  // human callers (req.actor.type === "user") bypass.
  router.post(
    "/suno-pipeline/bulk-approve",
    validate(
      z.object({
        companyId: z.string().uuid(),
        issueIds: z.array(z.string().uuid()).min(1).max(500),
        note: z.string().max(2000).optional(),
      }),
    ),
    async (req, res) => {
      const body = req.body as {
        companyId: string;
        issueIds: string[];
        note?: string;
      };
      assertCompanyAccess(req, body.companyId);

      const agentName = await resolveActorAgentName(db, req);
      if (req.actor.type === "agent" && agentName !== "Raphael") {
        throw forbidden(
          `Only Raphael can approve Suno issues (calling agent: ${agentName ?? "unknown"})`,
        );
      }

      const actor = getActorInfo(req);
      const results: Array<{ id: string; status: string; ok: boolean; reason?: string }> = [];

      for (const id of body.issueIds) {
        try {
          const existing = await loadIssueOrThrow(id, body.companyId);
          if (existing.status !== "REVIEW") {
            results.push({
              id,
              status: existing.status,
              ok: false,
              reason: `Not in REVIEW (current=${existing.status})`,
            });
            continue;
          }
          const [row] = await db
            .update(sunoIssues)
            .set({ status: "APPROVED", updatedAt: new Date() })
            .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
            .returning();
          if (!row) {
            results.push({ id, status: existing.status, ok: false, reason: "row vanished" });
            continue;
          }
          await syncLinkedIssueStatus(row, "APPROVED");
          await logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.approved",
            entityType: "suno_issue",
            entityId: row.id,
            details: { previousStatus: "REVIEW", newStatus: "APPROVED", note: body.note ?? null, bulk: true },
          });
          results.push({ id, status: "APPROVED", ok: true });
        } catch (err) {
          results.push({
            id,
            status: "?",
            ok: false,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const succeeded = results.filter((r) => r.ok).length;
      res.json({
        total: results.length,
        approved: succeeded,
        skipped: results.length - succeeded,
        results,
      });
    },
  );

  // ── POST /:id/reject ──────────────────────────────────────────────────────
  // Raphael moves REVIEW → GENERATING with feedback. Bumps metadata.iteration
  // so we can show the rep counter in the UI.
  router.post("/suno-pipeline/:id/reject", validate(rejectSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof rejectSchema>;
    assertCompanyAccess(req, body.companyId);

    const agentName = await resolveActorAgentName(db, req);
    if (req.actor.type === "agent" && agentName !== "Raphael") {
      throw forbidden(
        `Only Raphael can reject Suno issues (calling agent: ${agentName ?? "unknown"})`,
      );
    }

    const existing = await loadIssueOrThrow(id, body.companyId);
    assertTransition(existing.status as SunoStatus, "GENERATING", ["REVIEW"]);

    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const iteration = typeof meta.iteration === "number" ? meta.iteration + 1 : 1;
    const actor = getActorInfo(req);
    const nextMeta = appendHistory(
      { ...meta, iteration, lastRejectFeedback: body.feedback },
      {
        stage: "reject",
        output: body.feedback,
        at: new Date().toISOString(),
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        agentName,
        status: "GENERATING",
      },
    );

    const [row] = await db
      .update(sunoIssues)
      .set({ status: "GENERATING", metadata: nextMeta, updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await syncLinkedIssueStatus(row, "GENERATING");

    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.rejected",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        previousStatus: existing.status,
        newStatus: row.status,
        iteration,
        feedback: body.feedback,
      },
    });

    res.json(row);
  });

  // ── POST /:id/publish ─────────────────────────────────────────────────────
  // Sandalphon moves APPROVED → PUBLISHED. Locked to Sandalphon by agent name.
  router.post("/suno-pipeline/:id/publish", validate(transitionSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof transitionSchema>;
    assertCompanyAccess(req, body.companyId);

    const agentName = await resolveActorAgentName(db, req);
    if (req.actor.type === "agent" && agentName !== "Sandalphon") {
      throw forbidden(
        `Only Sandalphon can publish Suno issues (calling agent: ${agentName ?? "unknown"})`,
      );
    }

    const existing = await loadIssueOrThrow(id, body.companyId);
    assertTransition(existing.status as SunoStatus, "PUBLISHED", ["APPROVED"]);

    const [row] = await db
      .update(sunoIssues)
      .set({ status: "PUBLISHED", updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await syncLinkedIssueStatus(row, "PUBLISHED");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.published",
      entityType: "suno_issue",
      entityId: row.id,
      details: { previousStatus: existing.status, newStatus: row.status, note: body.note ?? null },
    });

    res.json(row);
  });

  // ── POST /:id/pick-canon ──────────────────────────────────────────────────
  // Set canonAudioVariant — which variant (Suno A-side / MiniMax B-side) is
  // the winner. Sandalphon will publish whichever audio URL this points at.
  // Pass variant=null to clear the pick.
  router.post("/suno-pipeline/:id/pick-canon", validate(pickCanonSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof pickCanonSchema>;
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);

    // Sanity: don't let user pick a variant whose audio URL doesn't exist.
    if (body.variant === "suno" && !existing.audioUrl) {
      throw unprocessable("Cannot pick suno: no audioUrl on this issue yet");
    }
    if (body.variant === "minimax" && !existing.minimaxAudioUrl) {
      throw unprocessable("Cannot pick minimax: no minimaxAudioUrl on this issue yet");
    }

    const [row] = await db
      .update(sunoIssues)
      .set({ canonAudioVariant: body.variant, updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.canon_picked",
      entityType: "suno_issue",
      entityId: row.id,
      details: { previousVariant: existing.canonAudioVariant, newVariant: body.variant },
    });

    res.json(row);
  });

  // ── POST /:id/dispatch-minimax ────────────────────────────────────────────
  // Standalone MiniMax dispatch — useful for re-rendering the B-side without
  // re-running the entire creative chain. Reads soundPrompt/lyrics from
  // metadata.stages by default; accept overrides in the body.
  router.post(
    "/suno-pipeline/:id/dispatch-minimax",
    validate(dispatchMinimaxSchema),
    async (req, res) => {
      const id = paramId(req);
      const body = req.body as z.infer<typeof dispatchMinimaxSchema>;
      assertCompanyAccess(req, body.companyId);

      const existing = await loadIssueOrThrow(id, body.companyId);
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;

      const prompt =
        body.prompt ??
        (typeof stages.soundPrompt === "string" ? (stages.soundPrompt as string) : "");
      const lyrics =
        body.lyrics ??
        (typeof stages.lyrics === "string" ? (stages.lyrics as string) : "");

      if (!prompt) {
        throw unprocessable(
          "dispatch-minimax requires a soundPrompt — generate Uriel stage first or pass prompt in the body",
        );
      }
      if (!lyrics && !body.isInstrumental) {
        throw unprocessable(
          "dispatch-minimax requires lyrics (or set isInstrumental: true) — generate Zadkiel stage first or pass lyrics in the body",
        );
      }

      let result: Awaited<ReturnType<typeof generateMinimaxMusic>>;
      try {
        result = await generateMinimaxMusic({
          model: body.model ?? MINIMAX_MUSIC_MODELS.free,
          prompt,
          lyrics: lyrics || "",
          outputUrl: true,
          isInstrumental: true,
          audioSetting: { sampleRate: 44100, bitrate: 256000, format: "mp3" },
          context: { db, companyId: body.companyId, sunoIssueId: existing.id },
        });
      } catch (err) {
        // Surface MiniMax-specific errors (insufficient balance, rate limit,
        // sensitive content, invalid key) as 422 with the friendly hint
        // message instead of a generic 500.
        const msg = err instanceof Error ? err.message : String(err);
        throw unprocessable(msg);
      }
      if (!result.isUrl) {
        throw unprocessable("MiniMax returned hex audio; expected URL");
      }
      const dispatchActor = getActorInfo(req);

      // Persist MiniMax audio to paperclip storage so it survives past the
      // 24h Aliyun OSS expiry. The permanent contentPath replaces the raw
      // pre-signed URL in the DB.
      const persisted = await persistMinimaxAudio({
        db,
        companyId: body.companyId,
        audioUrl: result.audio,
        traceId: result.traceId,
        agentId: dispatchActor.agentId,
        userId: dispatchActor.actorType === "user" ? dispatchActor.actorId : null,
      });

      const minimaxSongId = result.traceId
        ? `minimax:${result.traceId}`
        : `minimax:${Date.now()}`;
      const nextMeta = appendHistory(
        {
          ...meta,
          stages: {
            ...stages,
            minimaxAudioUrl: persisted.contentPath,
            minimaxSongId,
            minimaxAssetId: persisted.assetId,
            minimaxOriginalUrl: result.audio,
          },
          lastMusicBackend: "minimax",
          lastMusicModel: result.model,
          minimaxTraceId: result.traceId,
        },
        {
          stage: "minimaxAudioUrl",
          output: persisted.contentPath,
          at: new Date().toISOString(),
          actorType: dispatchActor.actorType,
          actorId: dispatchActor.actorId,
          agentId: dispatchActor.agentId,
          agentName: "Raziel/MiniMax (manual)",
          status: existing.status as SunoStatus,
        },
      );

      const [row] = await db
        .update(sunoIssues)
        .set({
          minimaxAudioUrl: persisted.contentPath,
          minimaxSongId,
          minimaxStatus: result.baseStatusCode,
          metadata: nextMeta,
          updatedAt: new Date(),
        })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!row) throw notFound("Suno issue not found");

      await logActivity(db, {
        companyId: body.companyId,
        actorType: dispatchActor.actorType,
        actorId: dispatchActor.actorId,
        agentId: dispatchActor.agentId,
        runId: dispatchActor.runId,
        action: "suno_issue.minimax_dispatched",
        entityType: "suno_issue",
        entityId: row.id,
        details: {
          model: result.model,
          elapsedMs: result.elapsedMs,
          traceId: result.traceId,
          baseStatusCode: result.baseStatusCode,
        },
      });

      res.json(row);
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  //   PHASE 9 — NLP BATCH GENERATION
  //   "10 hours of deep focus music" → N unique issues with creative titles
  // ──────────────────────────────────────────────────────────────────────

  // ── POST /batch/parse ────────────────────────────────────────────────
  // Parse an NLP request into a structured BatchPlan (no creation yet).
  // Lets the caller see the planned songCount + titles before committing.
  router.post(
    "/suno-pipeline/batch/parse",
    validate(batchParseSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof batchParseSchema>;
      assertCompanyAccess(req, body.companyId);
      const actor = getActorInfo(req);
      const plan = await parseBatchRequest(
        { request: body.request, maxSongCount: body.maxSongCount },
        { db, companyId: body.companyId, agentId: actor.agentId },
      );
      res.json(plan);
    },
  );

  // ── POST /batch/create ───────────────────────────────────────────────
  // Materialize a BatchPlan as N sunoIssues. Each variation becomes one
  // issue with concept = variation.title, soundPrompt cached in
  // metadata.stages, and metadata.batchId linking siblings together.
  // Status starts at GENERATING since we know the prompt is set.
  router.post(
    "/suno-pipeline/batch/create",
    validate(batchCreateSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof batchCreateSchema>;
      assertCompanyAccess(req, body.companyId);
      const actor = getActorInfo(req);

      let plan: BatchPlan;
      if (body.plan) {
        plan = body.plan as BatchPlan;
      } else if (body.request) {
        plan = await parseBatchRequest(
          { request: body.request, maxSongCount: body.maxSongCount },
          { db, companyId: body.companyId, agentId: actor.agentId },
        );
      } else {
        throw unprocessable("batch/create requires either `plan` or `request`");
      }

      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Insert all N issues in a single batch insert. Returns the created rows.
      const valuesToInsert = plan.variations.map((v, idx) => ({
        companyId: body.companyId,
        concept: v.title, // The TITLE becomes the visible concept on the kanban
        targetChakra: plan.targetChakra,
        targetFrequency: plan.targetFrequency,
        genre: plan.genre,
        status: "GENERATING" as SunoStatus,
        metadata: {
          stages: {
            soundPrompt: v.soundPrompt,
          },
          batchId,
          batchSequence: idx + 1,
          batchTotal: plan.variations.length,
          batchRequest: plan.request,
          batchMasterConcept: plan.masterConcept,
          variationConcept: v.concept,
          history: [
            {
              stage: "batch.created",
              output: `Issue ${idx + 1}/${plan.variations.length} of batch "${plan.request}"`,
              at: new Date().toISOString(),
              actorType: actor.actorType,
              actorId: actor.actorId,
              agentId: actor.agentId,
              agentName: "Null Angel (batch)",
              status: "GENERATING" as SunoStatus,
            },
          ],
        },
      }));

      const created = await db.insert(sunoIssues).values(valuesToInsert).returning();

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.batch_created",
        entityType: "suno_issue",
        entityId: created[0]?.id,
        details: {
          batchId,
          songCount: created.length,
          totalDurationMinutes: plan.totalDurationMinutes,
          targetChakra: plan.targetChakra,
          masterConcept: plan.masterConcept.slice(0, 200),
        },
      });

      res.status(201).json({
        batchId,
        plan,
        issueCount: created.length,
        issueIds: created.map((i) => i.id),
      });
    },
  );

  // ── POST /batch/:batchId/execute ─────────────────────────────────────
  // Fire all sibling issues through the music backend with bounded
  // concurrency. Default backend is MiniMax (fast, server-side, no Chrome
  // dep). For Suno, concurrency forces to 1 because the browser agent is
  // single-tab.
  router.post(
    "/suno-pipeline/batch/:batchId/execute",
    validate(batchExecuteSchema),
    async (req, res) => {
      const batchId = req.params.batchId as string;
      const body = req.body as z.infer<typeof batchExecuteSchema>;
      assertCompanyAccess(req, body.companyId);
      const actor = getActorInfo(req);

      // Locate all sibling issues. Pull the ones still in GENERATING (skip
      // already-completed ones so re-running execute is idempotent).
      const siblings = await db
        .select()
        .from(sunoIssues)
        .where(
          and(
            eq(sunoIssues.companyId, body.companyId),
            sql`${sunoIssues.metadata}->>'batchId' = ${batchId}`,
          ),
        );

      const todo = siblings.filter((s) => {
        if (s.status === "PUBLISHED" || s.status === "FAILED") return false;
        const meta = (s.metadata ?? {}) as Record<string, unknown>;
        const stages = (meta.stages && typeof meta.stages === "object"
          ? (meta.stages as Record<string, unknown>)
          : {}) as Record<string, unknown>;
        // Already has audio — skip
        if (s.minimaxAudioUrl || stages.audioUrl) return false;
        return true;
      });

      if (todo.length === 0) {
        res.json({
          batchId,
          totalSiblings: siblings.length,
          executed: 0,
          message: "All sibling issues already have audio or are terminal.",
        });
        return;
      }

      const concurrency = body.musicBackend === "suno" ? 1 : body.concurrency;

      logger.info(
        {
          batchId,
          backend: body.musicBackend,
          concurrency,
          todoCount: todo.length,
        },
        "[batch.execute] starting bulk generation",
      );

      // Respond IMMEDIATELY with the plan — the actual execution runs in
      // the background. The route doesn't wait for 100+ generations to
      // complete; the caller polls /batches/:id for status.
      res.status(202).json({
        batchId,
        backend: body.musicBackend,
        concurrency,
        totalSiblings: siblings.length,
        executing: todo.length,
        message: `Firing ${todo.length} generations in background with concurrency=${concurrency}`,
      });

      // ── Inner helper: after audio lands, fire Jophiel's visual prompt +
      //    cover art. Best-effort — if either step fails we log and keep
      //    the issue in REVIEW with audio but no thumbnail. The Hermes
      //    Albedo aesthetic is baked into buildVisualPromptPrompt.
      const generateThumbnail = async (issueId: string) => {
        try {
          const fresh = await db
            .select()
            .from(sunoIssues)
            .where(eq(sunoIssues.id, issueId))
            .limit(1);
          const cur = fresh[0];
          if (!cur) return;
          const meta = (cur.metadata ?? {}) as Record<string, unknown>;
          const stages = (meta.stages && typeof meta.stages === "object"
            ? (meta.stages as Record<string, unknown>)
            : {}) as Record<string, unknown>;

          // Step 1: Jophiel writes the visual prompt
          const visualMessages = buildVisualPromptPrompt({
            concept: cur.concept,
            targetChakra: cur.targetChakra ?? "THIRD_EYE",
            targetFrequency: cur.targetFrequency ?? 852,
            genre: cur.genre,
            soundPrompt:
              typeof stages.soundPrompt === "string"
                ? (stages.soundPrompt as string)
                : undefined,
          });
          const visualPrompt = await callOpenRouter({
            messages: visualMessages,
            temperature: 0.7,
            maxTokens: 500,
          });

          // Step 2: render cover art with Hermes Albedo aesthetic
          const coverArt = await generateCoverArt({
            prompt: visualPrompt,
            aspectRatio: "1:1",
          });

          // Step 3: persist
          const meta2 = { ...meta };
          const stages2 = { ...stages, visualPrompt, thumbnailUrl: coverArt.dataUrl };
          await db
            .update(sunoIssues)
            .set({
              thumbnailUrl: coverArt.dataUrl,
              metadata: appendHistory(
                { ...meta2, stages: stages2, lastCoverArtModel: coverArt.model },
                {
                  stage: "thumbnailUrl",
                  output: {
                    mimeType: coverArt.mimeType,
                    dataUrlBytes: coverArt.dataUrl.length,
                    elapsedMs: coverArt.elapsedMs,
                  },
                  at: new Date().toISOString(),
                  actorType: actor.actorType,
                  actorId: actor.actorId,
                  agentId: actor.agentId,
                  agentName: "Jophiel (batch)",
                  status: cur.status as SunoStatus,
                },
              ),
              updatedAt: new Date(),
            })
            .where(eq(sunoIssues.id, issueId));
        } catch (err) {
          logger.warn(
            {
              issueId,
              error: err instanceof Error ? err.message : String(err),
            },
            "[batch.execute] thumbnail generation failed (non-fatal)",
          );
        }
      };

      // Background execution. Errors per-job don't fail the whole batch.
      runWithConcurrency(todo, concurrency, async (issue) => {
        const meta = (issue.metadata ?? {}) as Record<string, unknown>;
        const stages = (meta.stages && typeof meta.stages === "object"
          ? (meta.stages as Record<string, unknown>)
          : {}) as Record<string, unknown>;
        const soundPrompt =
          (typeof stages.soundPrompt === "string" ? stages.soundPrompt : "") ||
          issue.concept;

        if (body.musicBackend === "minimax") {
          const chakraKey = (issue.targetChakra ?? null) as ChakraKey | null;
          const minimaxPrompt = buildMiniMaxPrompt(soundPrompt, chakraKey, null);
          const result = await generateMinimaxMusic({
            model: MINIMAX_MUSIC_MODELS.free,
            prompt: minimaxPrompt,
            lyrics: "",
            outputUrl: true,
            isInstrumental: true,
            audioSetting: { sampleRate: 44100, bitrate: 256000, format: "mp3" },
            context: { db, companyId: body.companyId, sunoIssueId: issue.id },
          });
          if (!result.isUrl) throw new Error("MiniMax returned hex audio; expected URL");
          const persisted = await persistMinimaxAudio({
            db,
            companyId: body.companyId,
            audioUrl: result.audio,
            traceId: result.traceId,
            agentId: actor.agentId,
            userId: actor.actorType === "user" ? actor.actorId : null,
          });
          const songId = result.traceId ? `minimax:${result.traceId}` : `minimax:${Date.now()}`;
          await db
            .update(sunoIssues)
            .set({
              minimaxAudioUrl: persisted.contentPath,
              minimaxSongId: songId,
              minimaxStatus: result.baseStatusCode,
              status: "REVIEW",
              metadata: appendHistory(
                {
                  ...meta,
                  stages: {
                    ...stages,
                    minimaxAudioUrl: persisted.contentPath,
                    minimaxSongId: songId,
                    minimaxAssetId: persisted.assetId,
                    minimaxOriginalUrl: result.audio,
                  },
                  lastMusicBackend: "minimax",
                  lastMusicModel: result.model,
                  minimaxTraceId: result.traceId,
                },
                {
                  stage: "minimaxAudioUrl",
                  output: persisted.contentPath,
                  at: new Date().toISOString(),
                  actorType: actor.actorType,
                  actorId: actor.actorId,
                  agentId: actor.agentId,
                  agentName: "Raziel/MiniMax (batch)",
                  status: "REVIEW" as SunoStatus,
                },
              ),
              updatedAt: new Date(),
            })
            .where(and(eq(sunoIssues.id, issue.id), eq(sunoIssues.companyId, body.companyId)));
          await generateThumbnail(issue.id);
          return { kind: "minimax", songId, audioUrl: persisted.contentPath };
        }

        // Suno backend — sequential through the same browser tab.
        if (body.musicBackend === "suno") {
          const sunoResult = await generateViaSuno(soundPrompt);
          await db
            .update(sunoIssues)
            .set({
              audioUrl: sunoResult.audioUrl,
              sunoSongId: sunoResult.songId,
              status: "REVIEW",
              metadata: appendHistory(
                {
                  ...meta,
                  stages: {
                    ...stages,
                    audioUrl: sunoResult.audioUrl,
                    sunoSongId: sunoResult.songId,
                    sunoVariants: sunoResult.variants,
                  },
                  lastMusicBackend: "suno",
                },
                {
                  stage: "audioUrl",
                  output: sunoResult.audioUrl,
                  at: new Date().toISOString(),
                  actorType: actor.actorType,
                  actorId: actor.actorId,
                  agentId: actor.agentId,
                  agentName: "Raziel/Suno (batch)",
                  status: "REVIEW" as SunoStatus,
                },
              ),
              updatedAt: new Date(),
            })
            .where(and(eq(sunoIssues.id, issue.id), eq(sunoIssues.companyId, body.companyId)));
          await generateThumbnail(issue.id);
          return { kind: "suno", songId: sunoResult.songId, audioUrl: sunoResult.audioUrl };
        }

        throw new Error("Unknown music backend");
      })
        .then((results) => {
          const succeeded = results.filter((r) => r.ok).length;
          const failed = results.length - succeeded;
          logger.info(
            { batchId, succeeded, failed, total: results.length },
            "[batch.execute] batch complete",
          );
          return logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.batch_execute_complete",
            entityType: "suno_issue",
            entityId: todo[0]?.id,
            details: { batchId, succeeded, failed, total: results.length, backend: body.musicBackend },
          });
        })
        .catch((err) => {
          logger.error(
            { batchId, error: err instanceof Error ? err.message : String(err) },
            "[batch.execute] runWithConcurrency outer failure",
          );
        });
    },
  );

  // ── GET /batches ─────────────────────────────────────────────────────
  // List all batches for a company, with per-batch progress counts.
  router.get(
    "/suno-pipeline/batches",
    async (req, res) => {
      const companyId = String(req.query.companyId ?? "");
      if (!companyId) throw unprocessable("companyId is required");
      assertCompanyAccess(req, companyId);

      const all = await db
        .select()
        .from(sunoIssues)
        .where(
          and(
            eq(sunoIssues.companyId, companyId),
            sql`${sunoIssues.metadata}->>'batchId' IS NOT NULL`,
          ),
        );

      // Group by batchId, aggregate counts
      const byBatch = new Map<
        string,
        {
          batchId: string;
          masterConcept: string;
          batchRequest: string;
          total: number;
          ready: number;
          pending: number;
          failed: number;
          createdAt: string;
          targetChakra: string | null;
        }
      >();

      for (const issue of all) {
        const meta = (issue.metadata ?? {}) as Record<string, unknown>;
        const batchId = String(meta.batchId ?? "");
        if (!batchId) continue;
        const masterConcept = String(meta.batchMasterConcept ?? "");
        const batchRequest = String(meta.batchRequest ?? "");
        let entry = byBatch.get(batchId);
        if (!entry) {
          entry = {
            batchId,
            masterConcept,
            batchRequest,
            total: 0,
            ready: 0,
            pending: 0,
            failed: 0,
            createdAt: issue.createdAt.toISOString(),
            targetChakra: issue.targetChakra ?? null,
          };
          byBatch.set(batchId, entry);
        }
        entry.total += 1;
        if (issue.status === "FAILED") entry.failed += 1;
        else if (
          issue.audioUrl ||
          issue.minimaxAudioUrl ||
          issue.status === "REVIEW" ||
          issue.status === "APPROVED" ||
          issue.status === "PUBLISHED"
        )
          entry.ready += 1;
        else entry.pending += 1;
      }

      res.json(Array.from(byBatch.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    },
  );

  // ──────────────────────────────────────────────────────────────────────
  //   PHASE 10 — DAY PLAN (Hermes the host)
  //   "Deep work 8-12, workout 12-1, wind down 5-6, sleep at 11"
  //   →  Hermes prescribes chakras + frequencies per block
  //   →  user confirms
  //   →  one batch per block fires
  // ──────────────────────────────────────────────────────────────────────

  // ── POST /angel-refine ──────────────────────────────────────────────
  // Angel Invocation — ruling angel LLM-refines the user's free-text
  // "materia" into a structured concept. No state mutated — preview only.
  // After the user confirms, the frontend calls create + auto-run.
  router.post(
    "/suno-pipeline/angel-refine",
    validate(angelRefineSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof angelRefineSchema>;
      assertCompanyAccess(req, body.companyId);
      const result = await angelRefine(
        {
          chakra: body.chakra,
          rulingAngel: body.rulingAngel,
          userInput: body.userInput,
          presetId: body.presetId,
          presetConcept: body.presetConcept,
          presetGenre: body.presetGenre,
        },
        { db, companyId: body.companyId },
      );
      res.json(result);
    },
  );

  // ── POST /day-plan/parse ─────────────────────────────────────────────
  // Hermes asks first ("What are we composing today?"), reads the user's
  // tasks, and returns a structured plan with chakra/frequency per block
  // PLUS the host greeting + summary lines so the UI can render the
  // ritual chamber feel. No state is mutated yet — this is preview.
  router.post(
    "/suno-pipeline/day-plan/parse",
    validate(dayPlanParseSchema),
    async (req, res) => {
      try {
        const body = req.body as z.infer<typeof dayPlanParseSchema>;
        assertCompanyAccess(req, body.companyId);
        const actor = getActorInfo(req);
        const plan = await parseDayPlan(
          { request: body.request },
          { db, companyId: body.companyId, agentId: actor.agentId },
        );
        // Decorate each block with the ruling angel so the UI doesn't need
        // its own copy of the chakra-angel registry.
        const decorated = {
          ...plan,
          blocks: plan.blocks.map((b) => ({
            ...b,
            rulingAngel: CHAKRA_ANGEL[b.targetChakra],
          })),
        };
        res.json(decorated);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        logger.error({ err }, "[day-plan/parse] failed");
        res.status(500).json({ error: message });
      }
    },
  );

  // ── POST /day-plan/create ────────────────────────────────────────────
  // Materialize a confirmed DayPlan as one Suno batch per block. Returns
  // the list of created batchIds so the UI can poll progress.
  router.post(
    "/suno-pipeline/day-plan/create",
    validate(dayPlanCreateSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof dayPlanCreateSchema>;
      assertCompanyAccess(req, body.companyId);
      const actor = getActorInfo(req);

      const dayPlanId = `dayplan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const maxPerBlock = body.maxSongsPerBlock ?? 50;
      const batchesCreated: Array<{
        batchId: string;
        blockLabel: string;
        chakra: string;
        durationMinutes: number;
        songCount: number;
        firstIssueId: string;
      }> = [];

      // For each block, compose a batch-parse-style request and create N
      // issues directly. Skipping /batch/parse's LLM call since the day-plan
      // already gave us the master prompt; we synthesize variation titles
      // from the block label + sequence.
      for (let blockIdx = 0; blockIdx < body.plan.blocks.length; blockIdx++) {
        const block = body.plan.blocks[blockIdx]!;
        const songCount = Math.min(
          maxPerBlock,
          Math.max(1, Math.ceil(block.durationMinutes / 3.5)),
        );
        const batchId = `${dayPlanId}-block${blockIdx + 1}-${Math.random().toString(36).slice(2, 6)}`;

        const valuesToInsert = Array.from({ length: songCount }, (_, songIdx) => ({
          companyId: body.companyId,
          concept: `${block.label} · pt ${songIdx + 1}`,
          targetChakra: block.targetChakra,
          targetFrequency: block.targetFrequency,
          genre: block.genre,
          status: "GENERATING" as SunoStatus,
          metadata: {
            stages: { soundPrompt: block.masterSoundPrompt },
            batchId,
            batchSequence: songIdx + 1,
            batchTotal: songCount,
            batchRequest: body.plan.request,
            batchMasterConcept: block.label,
            // Day-plan linkage — every block in the plan shares this id.
            dayPlanId,
            dayPlanBlockIndex: blockIdx + 1,
            dayPlanBlockTotal: body.plan.blocks.length,
            dayPlanBlockLabel: block.label,
            dayPlanRationale: block.rationale ?? "",
            rulingAngel: CHAKRA_ANGEL[block.targetChakra],
            history: [
              {
                stage: "day-plan.created",
                output: `${block.label} (${block.durationMinutes}m at ${block.targetFrequency} Hz, ${CHAKRA_ANGEL[block.targetChakra].name})`,
                at: new Date().toISOString(),
                actorType: actor.actorType,
                actorId: actor.actorId,
                agentId: actor.agentId,
                agentName: `Hermes → ${CHAKRA_ANGEL[block.targetChakra].name}`,
                status: "GENERATING" as SunoStatus,
              },
            ],
          },
        }));

        const created = await db.insert(sunoIssues).values(valuesToInsert).returning();
        if (!created[0]) continue;

        await logActivity(db, {
          companyId: body.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "suno_issue.day_plan_block_created",
          entityType: "suno_issue",
          entityId: created[0].id,
          details: {
            dayPlanId,
            batchId,
            blockIndex: blockIdx + 1,
            blockTotal: body.plan.blocks.length,
            blockLabel: block.label,
            chakra: block.targetChakra,
            frequency: block.targetFrequency,
            durationMinutes: block.durationMinutes,
            songCount,
            angelName: CHAKRA_ANGEL[block.targetChakra].name,
          },
        });

        batchesCreated.push({
          batchId,
          blockLabel: block.label,
          chakra: block.targetChakra,
          durationMinutes: block.durationMinutes,
          songCount,
          firstIssueId: created[0].id,
        });
      }

      res.status(201).json({
        dayPlanId,
        totalDurationMinutes: body.plan.totalDurationMinutes,
        blockCount: body.plan.blocks.length,
        totalSongs: batchesCreated.reduce((s, b) => s + b.songCount, 0),
        batches: batchesCreated,
      });
    },
  );

  // ── POST /import-suno ────────────────────────────────────────────────────
  // Import an out-of-band Suno generation (made directly on suno.com or via
  // the CDP test harness) into paperclip. Creates a new sunoIssue, persists
  // each variant's audio to paperclip's storage so the songs are owned (not
  // dependent on cdn1.suno.ai staying available), and writes the metadata
  // shape downstream agents expect so cover-art / release-copy / publish
  // all work against the imported row.
  router.post(
    "/suno-pipeline/import-suno",
    validate(importSunoSchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof importSunoSchema>;
      assertCompanyAccess(req, body.companyId);
      const actor = getActorInfo(req);

      // 1. Persist every variant. Done in parallel because each is an
      //    independent CDN fetch + storage write. Returns a list of
      //    { sunoSongId, audioUrl: <permanent contentPath>, title } that
      //    becomes the canonical sunoVariants array on the issue.
      const persistedVariants = await Promise.all(
        body.variants.map(async (v) => {
          const persisted = await persistAudioFromUrl({
            db,
            companyId: body.companyId,
            audioUrl: v.sunoUrl,
            identifier: v.sunoSongId,
            filenamePrefix: "suno",
            namespace: "music/suno",
            agentId: actor.agentId,
            userId: actor.actorType === "user" ? actor.actorId : null,
          });
          return {
            sunoSongId: v.sunoSongId,
            audioUrl: persisted.contentPath,
            originalSunoUrl: v.sunoUrl,
            assetId: persisted.assetId,
            title: v.title ?? "",
            byteSize: persisted.byteSize,
            sha256: persisted.sha256,
          };
        }),
      );

      const primary = persistedVariants[0];
      if (!primary) {
        // Schema enforces .min(1) but TS narrowing wants this guard.
        throw unprocessable("import-suno requires at least one variant");
      }

      // 2. Build the metadata.stages payload that downstream agents read.
      //    Mirrors the shape produced by dispatch-suno's success path so
      //    /generate/visual-prompt and /generate/cover-art work without
      //    branching on the issue's origin.
      const initialMeta = appendHistory(
        {
          stages: {
            soundPrompt: body.soundPrompt,
            audioUrl: primary.audioUrl,
            sunoSongId: primary.sunoSongId,
            sunoVariants: persistedVariants.map((v) => ({
              songId: v.sunoSongId,
              audioUrl: v.audioUrl,
              title: v.title,
              originalSunoUrl: v.originalSunoUrl,
              assetId: v.assetId,
            })),
          },
          lastMusicBackend: "suno",
          importedFromSuno: true,
        },
        {
          stage: "audioUrl",
          output: primary.audioUrl,
          at: new Date().toISOString(),
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          agentName: "Raziel/Suno (imported)",
          status: "REVIEW" as SunoStatus,
        },
      );

      // 3. Insert the issue. Status starts at REVIEW because audio is already
      //    finalized — no GENERATING phase to transition through. Frequency
      //    derives from chakra when not explicitly passed.
      const targetFrequency =
        body.targetFrequency ?? SUNO_CHAKRA_FREQUENCIES[body.targetChakra];
      const [issue] = await db
        .insert(sunoIssues)
        .values({
          companyId: body.companyId,
          concept: body.concept,
          targetChakra: body.targetChakra,
          targetFrequency,
          genre: body.genre ?? null,
          status: "REVIEW",
          audioUrl: primary.audioUrl,
          sunoSongId: primary.sunoSongId,
          metadata: initialMeta,
        })
        .returning();
      if (!issue) throw new Error("Failed to insert imported sunoIssue");

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.imported",
        entityType: "suno_issue",
        entityId: issue.id,
        details: {
          concept: body.concept,
          targetChakra: body.targetChakra,
          variantCount: persistedVariants.length,
          totalBytes: persistedVariants.reduce((sum, v) => sum + v.byteSize, 0),
          primarySongId: primary.sunoSongId,
        },
      });

      res.status(201).json(issue);
    },
  );

  // ── POST /:id/dispatch-suno ──────────────────────────────────────────────
  // Standalone Suno dispatch via browser automation (Raziel).
  // Requires Chrome running with --remote-debugging-port=9222 + Suno login.
  router.post("/suno-pipeline/:id/dispatch-suno", async (req, res) => {
    const id = req.params.id!;
    const body = req.body as { companyId: string; prompt?: string };
    if (!body.companyId) { res.status(400).json({ error: "companyId required" }); return; }
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);
    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const stages = (meta.stages && typeof meta.stages === "object"
      ? (meta.stages as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const prompt = body.prompt ??
      (typeof stages.soundPrompt === "string" ? (stages.soundPrompt as string) : "");

    if (!prompt) {
      res.status(422).json({ error: "dispatch-suno requires a soundPrompt" });
      return;
    }

    const actor = getActorInfo(req);

    try {
      const result = await generateViaSuno(prompt);

      const nextMeta = appendHistory(
        {
          ...meta,
          stages: {
            ...stages,
            audioUrl: result.audioUrl,
            sunoSongId: result.songId,
            sunoVariants: result.variants,
          },
          lastMusicBackend: "suno",
        },
        {
          stage: "audioUrl",
          output: result.audioUrl,
          at: new Date().toISOString(),
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          agentName: "Raziel/Suno (manual)",
          status: existing.status as SunoStatus,
        },
      );

      const [updated] = await db
        .update(sunoIssues)
        .set({
          audioUrl: result.audioUrl,
          sunoSongId: result.songId,
          metadata: nextMeta,
          updatedAt: new Date(),
        })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.suno_dispatched",
        entityType: "suno_issue",
        entityId: id,
        details: {
          songId: result.songId,
          audioUrl: result.audioUrl,
          duration: result.duration,
          title: result.title,
          variantCount: result.variants.length,
        },
      });

      res.json(updated);
    } catch (err) {
      // Suno CDP failed — return error with details
      res.status(422).json({
        error: `Suno browser automation failed: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Ensure Chrome is running with --remote-debugging-port=9222 and you're logged into suno.com",
      });
    }
  });


  // ── POST /:id/fail ────────────────────────────────────────────────────────
  // Any agent can move any non-terminal status to FAILED with a reason.
  router.post("/suno-pipeline/:id/fail", validate(failSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof failSchema>;
    assertCompanyAccess(req, body.companyId);

    const existing = await loadIssueOrThrow(id, body.companyId);
    if (existing.status === "PUBLISHED" || existing.status === "FAILED") {
      throw unprocessable(
        `Issue is already in terminal state ${existing.status}.`,
      );
    }

    const meta = (existing.metadata ?? {}) as Record<string, unknown>;
    const actor = getActorInfo(req);
    const agentName = await resolveActorAgentName(db, req);
    const nextMeta = appendHistory(
      { ...meta, lastFailureReason: body.reason },
      {
        stage: "fail",
        output: body.reason,
        at: new Date().toISOString(),
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        agentName,
        status: "FAILED",
      },
    );

    const [row] = await db
      .update(sunoIssues)
      .set({ status: "FAILED", metadata: nextMeta, updatedAt: new Date() })
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await syncLinkedIssueStatus(row, "FAILED");

    await logActivity(db, {
      companyId: body.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "suno_issue.failed",
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        previousStatus: existing.status,
        newStatus: row.status,
        reason: body.reason,
      },
    });

    res.json(row);
  });

  // ────────────────────────────────────────────────────────────────────────
  //   GENERATION HOOKS (Phase 8 — OpenRouter free-tier)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Persist a stage output onto an issue in the same shape /deposit uses,
   * so the LLM-generated content joins the same history trail. Returns the
   * updated row.
   */
  async function persistGeneratedStage(args: {
    issue: typeof sunoIssues.$inferSelect;
    companyId: string;
    stage: string;
    output: string | Record<string, unknown>;
    agentName: string | null;
    actor: ReturnType<typeof getActorInfo>;
    model: string;
  }) {
    const meta = (args.issue.metadata ?? {}) as Record<string, unknown>;
    const stageCache = (meta.stages && typeof meta.stages === "object"
      ? { ...(meta.stages as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    stageCache[args.stage] = args.output;

    const nextMeta = appendHistory(
      { ...meta, stages: stageCache, lastGenModel: args.model },
      {
        stage: args.stage,
        output: args.output,
        at: new Date().toISOString(),
        actorType: args.actor.actorType,
        actorId: args.actor.actorId,
        agentId: args.actor.agentId,
        agentName: args.agentName,
        status: args.issue.status as SunoStatus,
      },
    );

    const [row] = await db
      .update(sunoIssues)
      .set({ metadata: nextMeta, updatedAt: new Date() })
      .where(
        and(eq(sunoIssues.id, args.issue.id), eq(sunoIssues.companyId, args.companyId)),
      )
      .returning();
    if (!row) throw notFound("Suno issue not found");

    await logActivity(db, {
      companyId: args.companyId,
      actorType: args.actor.actorType,
      actorId: args.actor.actorId,
      agentId: args.actor.agentId,
      runId: args.actor.runId,
      action: `suno_issue.generated.${args.stage}`,
      entityType: "suno_issue",
      entityId: row.id,
      details: {
        stage: args.stage,
        agentName: args.agentName,
        model: args.model,
        outputSize:
          typeof args.output === "string" ? args.output.length : JSON.stringify(args.output).length,
      },
    });

    return row;
  }

  /** Build the LLM context object from an issue + caller hints. */
  function ctxFromIssue(
    issue: typeof sunoIssues.$inferSelect,
    hints?: Record<string, unknown>,
  ): SunoLlmContext {
    const meta = (issue.metadata ?? {}) as Record<string, unknown>;
    const stages = (meta.stages && typeof meta.stages === "object"
      ? (meta.stages as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    return {
      concept: issue.concept,
      targetChakra: issue.targetChakra,
      targetFrequency: issue.targetFrequency,
      genre: issue.genre,
      lyrics: typeof stages.lyrics === "string" ? (stages.lyrics as string) : undefined,
      soundPrompt:
        typeof stages.soundPrompt === "string"
          ? (stages.soundPrompt as string)
          : undefined,
      hints,
    };
  }

  /**
   * Look up an archangel by name within a company and return its overridable
   * generation config. Returns null fields when the agent doesn't exist or
   * doesn't have overrides set — runGenerate falls back to its defaults.
   *
   * Convention: each archangel can override two keys in `agents.runtimeConfig`:
   *   - `model`         — string, overrides SUNO_MODELS[stage] and body.model
   *   - `systemPrompt`  — string, replaces the default builder's system message
   *
   * Edit these via the Paperclip Agents page (or via SQL) without touching code.
   */
  async function loadArchangelConfig(
    companyId: string,
    archangelName: string,
  ): Promise<{ model: string | null; systemPrompt: string | null }> {
    const [agent] = await db
      .select({
        runtimeConfig: agentsTable.runtimeConfig,
      })
      .from(agentsTable)
      .where(
        and(eq(agentsTable.companyId, companyId), eq(agentsTable.name, archangelName)),
      )
      .limit(1);
    const cfg = (agent?.runtimeConfig ?? {}) as Record<string, unknown>;
    return {
      model: typeof cfg.model === "string" ? (cfg.model as string) : null,
      systemPrompt:
        typeof cfg.systemPrompt === "string" ? (cfg.systemPrompt as string) : null,
    };
  }

  /**
   * Common runner for the four /generate/* routes. Loads the issue, asserts
   * status is non-terminal, looks up the archangel's runtimeConfig overrides,
   * calls OpenRouter, and persists the result onto the same metadata.stages
   * cache + history trail used by /deposit.
   *
   * Resolution order for `model`:    agent.runtimeConfig.model > body.model > args.defaultModel
   * Resolution order for `system`:   agent.runtimeConfig.systemPrompt > args.build(ctx)[0]
   */
  async function runGenerate(
    req: Request,
    res: { json: (body: unknown) => void; status: (n: number) => unknown },
    args: {
      stage: "lyrics" | "soundPrompt" | "visualPrompt" | "releaseCopy";
      /** Archangel responsible for this stage (looked up by name in the company). */
      archangelName: "Zadkiel" | "Uriel" | "Jophiel" | "Gabriel";
      defaultModel: string;
      build: (ctx: SunoLlmContext) => Parameters<typeof callOpenRouter>[0]["messages"];
      maxTokens?: number;
      /** When true, parse the LLM output as JSON and store the parsed object. */
      parseJson?: boolean;
    },
  ) {
    const id = paramId(req);
    const body = req.body as z.infer<typeof generateSchema>;
    assertCompanyAccess(req, body.companyId);

    const issue = await loadIssueOrThrow(id, body.companyId);
    if (issue.status === "PUBLISHED" || issue.status === "FAILED") {
      throw unprocessable(
        `Cannot generate ${args.stage} on a ${issue.status} issue (terminal state).`,
      );
    }

    // Per-archangel overrides from agents.runtimeConfig — lets the user swap
    // models + prompts without touching code. See loadArchangelConfig().
    const overrides = await loadArchangelConfig(body.companyId, args.archangelName);
    const model = overrides.model ?? body.model ?? args.defaultModel;

    const ctx = ctxFromIssue(issue, body.hints);
    const messages = args.build(ctx);
    if (overrides.systemPrompt && messages[0]?.role === "system") {
      messages[0] = { role: "system", content: overrides.systemPrompt };
    }

    let raw: string;
    try {
      raw = await callOpenRouter({
        model,
        messages,
        maxTokens: args.maxTokens,
        context: {
          db,
          companyId: body.companyId,
          stage: args.stage,
          sunoIssueId: issue.id,
        },
      });
    } catch (err) {
      throw badRequest(
        `Generation failed for ${args.stage}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let output: string | Record<string, unknown> = raw;
    if (args.parseJson) {
      try {
        // Tolerate fenced code blocks like ```json ... ```
        const cleaned = raw
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();
        output = JSON.parse(cleaned);
      } catch (err) {
        // Not fatal — fall back to storing the raw string. Caller can re-run.
        output = { raw, parseError: err instanceof Error ? err.message : String(err) };
      }
    }

    const actor = getActorInfo(req);
    const callingAgentName = await resolveActorAgentName(db, req);
    const row = await persistGeneratedStage({
      issue,
      companyId: body.companyId,
      stage: args.stage,
      output,
      // The archangel responsible for the work (lookup by name) — distinct
      // from the actor who triggered the call (could be a board user OR an
      // agent acting on behalf of the archangel).
      agentName: callingAgentName ?? args.archangelName,
      actor,
      model,
    });

    res.json(row);
  }

  // Zadkiel — lyrics
  router.post(
    "/suno-pipeline/:id/generate/lyrics",
    validate(generateSchema),
    async (req, res) =>
      runGenerate(req, res, {
        stage: "lyrics",
        archangelName: "Zadkiel",
        defaultModel: SUNO_MODELS.lyrics,
        build: buildLyricsPrompt,
        maxTokens: 1200,
      }),
  );

  // Uriel — Suno description text
  router.post(
    "/suno-pipeline/:id/generate/sound-prompt",
    validate(generateSchema),
    async (req, res) =>
      runGenerate(req, res, {
        stage: "soundPrompt",
        archangelName: "Uriel",
        defaultModel: SUNO_MODELS.soundPrompt,
        build: buildSoundPromptPrompt,
        maxTokens: 600,
      }),
  );

  // Jophiel — image-gen prompt for cover art
  router.post(
    "/suno-pipeline/:id/generate/visual-prompt",
    validate(generateSchema),
    async (req, res) =>
      runGenerate(req, res, {
        stage: "visualPrompt",
        archangelName: "Jophiel",
        defaultModel: SUNO_MODELS.visualPrompt,
        build: buildVisualPromptPrompt,
        maxTokens: 500,
      }),
  );

  // Gabriel — release copy + social caption (returns JSON)
  router.post(
    "/suno-pipeline/:id/generate/release-copy",
    validate(generateSchema),
    async (req, res) =>
      runGenerate(req, res, {
        stage: "releaseCopy",
        archangelName: "Gabriel",
        defaultModel: SUNO_MODELS.releaseCopy,
        build: buildReleaseCopyPrompt,
        maxTokens: 800,
        parseJson: true,
      }),
  );

  // ────────────────────────────────────────────────────────────────────────
  //   MUSIC GENERATION (Phase 10 — MiniMax music-2.6-free as Suno alt)
  // ────────────────────────────────────────────────────────────────────────

  // ── POST /:id/generate/song-via-minimax ───────────────────────────────────
  // Server-to-server alternative to Suno. No browser session required.
  // Uses metadata.stages.lyrics + metadata.stages.soundPrompt as input,
  // calls MiniMax /v1/music_generation, and deposits the resulting audio_url.
  router.post(
    "/suno-pipeline/:id/generate/song-via-minimax",
    validate(minimaxMusicSchema),
    async (req, res) => {
      const id = paramId(req);
      const body = req.body as z.infer<typeof minimaxMusicSchema>;
      assertCompanyAccess(req, body.companyId);

      const issue = await loadIssueOrThrow(id, body.companyId);
      if (issue.status === "PUBLISHED" || issue.status === "FAILED") {
        throw unprocessable(
          `Cannot generate music on a ${issue.status} issue (terminal state).`,
        );
      }

      // Pull lyrics + sound prompt from metadata.stages, with caller overrides.
      const meta = (issue.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;

      const prompt =
        body.prompt ??
        (typeof stages.soundPrompt === "string" ? (stages.soundPrompt as string) : null);
      const lyrics =
        body.lyrics ??
        (typeof stages.lyrics === "string" ? (stages.lyrics as string) : null);

      if (!prompt) {
        throw unprocessable(
          "MiniMax music gen requires a soundPrompt — deposit one first via /generate/sound-prompt or /deposit.",
        );
      }
      if (!lyrics && !body.isInstrumental) {
        throw unprocessable(
          "MiniMax music gen requires lyrics (or set isInstrumental: true) — deposit them first via /generate/lyrics or /deposit.",
        );
      }

      let result;
      try {
        result = await generateMinimaxMusic({
          model: (body.model as MinimaxMusicModel | undefined) ?? MINIMAX_MUSIC_MODELS.free,
          prompt,
          lyrics: lyrics || "",
          outputUrl: true,
          isInstrumental: true,
          audioSetting: { sampleRate: 44100, bitrate: 256000, format: "mp3" },
          context: { db, companyId: body.companyId, sunoIssueId: issue.id },
        });
      } catch (err) {
        throw badRequest(
          `MiniMax music generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!result.isUrl) {
        throw badRequest("MiniMax returned hex audio; expected URL");
      }

      const musicActor = getActorInfo(req);
      const persisted = await persistMinimaxAudio({
        db,
        companyId: body.companyId,
        audioUrl: result.audio,
        traceId: (result.extra?.["trace_id"] as string | null) ?? result.traceId,
        agentId: musicActor.agentId,
        userId: musicActor.actorType === "user" ? musicActor.actorId : null,
      });

      // Deposit audioUrl + tag the song id so we can tell which path produced it.
      const sunoSongId = `minimax:${(result.extra?.["trace_id"] as string) ?? Date.now()}`;
      const stageCache = {
        ...stages,
        audioUrl: persisted.contentPath,
        sunoSongId,
        minimaxAssetId: persisted.assetId,
        minimaxOriginalUrl: result.audio,
      };
      const nextMeta = appendHistory(
        { ...meta, stages: stageCache, lastMusicBackend: "minimax", lastMusicModel: result.model },
        {
          stage: "audioUrl",
          output: persisted.contentPath,
          at: new Date().toISOString(),
          actorType: musicActor.actorType,
          actorId: musicActor.actorId,
          agentId: musicActor.agentId,
          agentName: "Raziel/MiniMax",
          status: issue.status as SunoStatus,
        },
      );

      const [row] = await db
        .update(sunoIssues)
        .set({
          audioUrl: persisted.contentPath,
          sunoSongId,
          metadata: nextMeta,
          updatedAt: new Date(),
        })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!row) throw notFound("Suno issue not found");

      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.music_generated.minimax",
        entityType: "suno_issue",
        entityId: row.id,
        details: {
          model: result.model,
          elapsedMs: result.elapsedMs,
          audioUrlPresent: true,
        },
      });

      res.json(row);
    },
  );

  // ────────────────────────────────────────────────────────────────────────
  //   COVER ART GENERATION (Phase 8.5 — Jophiel renders the visualPrompt)
  // ────────────────────────────────────────────────────────────────────────

  // ── POST /:id/generate/cover-art ──────────────────────────────────────────
  // Jophiel renders an actual cover image from the visualPrompt that
  // /generate/visual-prompt produced. Replaces Suno's auto-generated
  // thumbnailUrl with a custom branded one. Original Suno cover is
  // preserved in metadata.previousThumbnails[].
  router.post(
    "/suno-pipeline/:id/generate/cover-art",
    validate(coverArtSchema),
    async (req, res) => {
      const id = paramId(req);
      const body = req.body as z.infer<typeof coverArtSchema>;
      assertCompanyAccess(req, body.companyId);

      const issue = await loadIssueOrThrow(id, body.companyId);
      if (issue.status === "PUBLISHED" || issue.status === "FAILED") {
        throw unprocessable(
          `Cannot generate cover art on a ${issue.status} issue (terminal state).`,
        );
      }

      // Pull the visualPrompt from metadata.stages — set by /generate/visual-prompt
      const meta = (issue.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const prompt =
        body.prompt ??
        (typeof stages.visualPrompt === "string"
          ? (stages.visualPrompt as string)
          : null);

      if (!prompt) {
        throw unprocessable(
          "Cover art generation requires a visualPrompt — call /generate/visual-prompt first or pass `prompt` in body.",
        );
      }

      // Per-archangel override: Jophiel's runtimeConfig.imageModel takes priority
      const overrides = await loadArchangelConfig(body.companyId, "Jophiel");
      const cfgModel =
        typeof (overrides as { imageModel?: unknown }).imageModel === "string"
          ? ((overrides as { imageModel?: string }).imageModel ?? null)
          : null;
      const model = body.model ?? cfgModel ?? undefined;

      let result;
      try {
        result = await generateCoverArt({
          prompt,
          model,
          aspectRatio: body.aspectRatio ?? "1:1",
        });
      } catch (err) {
        throw badRequest(
          `Cover art generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // Build the new metadata: cache new thumbnail, preserve old in history.
      const previousThumbnail =
        typeof issue.thumbnailUrl === "string" ? issue.thumbnailUrl : null;
      const stageCache = { ...stages, thumbnailUrl: result.dataUrl };
      const previousList = Array.isArray(meta.previousThumbnails)
        ? (meta.previousThumbnails as unknown[])
        : [];
      const actor = getActorInfo(req);
      const nextMeta = appendHistory(
        {
          ...meta,
          stages: stageCache,
          lastCoverArtModel: result.model,
          lastCoverArtMime: result.mimeType,
          previousThumbnails: previousThumbnail
            ? [...previousList, previousThumbnail]
            : previousList,
        },
        {
          // Don't dump the full base64 data URL into history — it's large.
          // We store size + mime here; the actual image lives in stages.thumbnailUrl
          // and top-level thumbnailUrl below.
          stage: "thumbnailUrl",
          output: {
            mimeType: result.mimeType,
            dataUrlBytes: result.dataUrl.length,
            caption: result.textCaption,
            elapsedMs: result.elapsedMs,
          },
          at: new Date().toISOString(),
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          agentName: "Jophiel",
          status: issue.status as SunoStatus,
        },
      );

      const [row] = await db
        .update(sunoIssues)
        .set({
          thumbnailUrl: result.dataUrl,
          metadata: nextMeta,
          updatedAt: new Date(),
        })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!row) throw notFound("Suno issue not found");

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.cover_art_generated",
        entityType: "suno_issue",
        entityId: row.id,
        details: {
          model: result.model,
          mimeType: result.mimeType,
          aspectRatio: body.aspectRatio ?? "1:1",
          imageSize: body.imageSize ?? "1K",
          dataUrlBytes: result.dataUrl.length,
          elapsedMs: result.elapsedMs,
          replacedPreviousThumbnail: !!previousThumbnail,
        },
      });

      res.json(row);
    },
  );

  // ────────────────────────────────────────────────────────────────────────
  //   AUTONOMOUS ORCHESTRATION (Phase 9-A)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Find an archangel agent in a company by exact name match. Used by
   * autoRun to auto-assign Zadkiel/Uriel/Jophiel without human intervention.
   */
  async function findArchangelByName(companyId: string, name: string) {
    const [row] = await db
      .select({ id: agentsTable.id, name: agentsTable.name })
      .from(agentsTable)
      .where(and(eq(agentsTable.companyId, companyId), eq(agentsTable.name, name)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Internal orchestration: synthesize a generate call without going through
   * the HTTP layer. Persists via the same persistGeneratedStage path. Returns
   * the updated issue row.
   */
  async function executeGenerateInternal(args: {
    issue: typeof sunoIssues.$inferSelect;
    companyId: string;
    stage: "lyrics" | "soundPrompt" | "visualPrompt" | "releaseCopy";
    archangelName: "Zadkiel" | "Uriel" | "Jophiel" | "Gabriel";
    defaultModel: string;
    build: (ctx: SunoLlmContext) => Parameters<typeof callOpenRouter>[0]["messages"];
    maxTokens?: number;
    parseJson?: boolean;
    hints?: Record<string, unknown>;
    actor: ReturnType<typeof getActorInfo>;
  }) {
    const overrides = await loadArchangelConfig(args.companyId, args.archangelName);
    const model = overrides.model ?? args.defaultModel;

    const ctx = ctxFromIssue(args.issue, args.hints);
    const messages = args.build(ctx);
    if (overrides.systemPrompt && messages[0]?.role === "system") {
      messages[0] = { role: "system", content: overrides.systemPrompt };
    }

    // Wrap the LLM call in an archangel heartbeat so the dashboard sees this
    // archangel actually doing work — heartbeat_runs row, lifecycle events,
    // agents.status flip running→idle, agent_runtime_state.updatedAt bumped.
    return withArchangelRun(
      {
        db,
        companyId: args.companyId,
        archangelName: args.archangelName,
        action: `generate.${args.stage}`,
        sunoIssueId: args.issue.id,
        contextSnapshot: { stage: args.stage, model, concept: args.issue.concept.slice(0, 200) },
      },
      async () => {
        const raw = await callOpenRouter({
          model,
          messages,
          maxTokens: args.maxTokens,
          context: {
            db,
            companyId: args.companyId,
            stage: args.stage,
            sunoIssueId: args.issue.id,
          },
        });
        let output: string | Record<string, unknown> = raw;
        if (args.parseJson) {
          try {
            const cleaned = raw
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/```\s*$/i, "")
              .trim();
            output = JSON.parse(cleaned);
          } catch (err) {
            output = { raw, parseError: err instanceof Error ? err.message : String(err) };
          }
        }

        return persistGeneratedStage({
          issue: args.issue,
          companyId: args.companyId,
          stage: args.stage,
          output,
          agentName: args.archangelName,
          actor: args.actor,
          model,
        });
      },
    );
  }

  // ── POST /:id/auto-run ────────────────────────────────────────────────────
  // Synchronous end-to-end orchestrator. Runs the full creative chain in
  // MELODY-FIRST order — Uriel designs the sonic palette before Zadkiel
  // writes lyrics, so the lyrics fit the BPM/cadence/mood instead of forcing
  // Uriel to retro-fit drums to whatever Zadkiel imagined.
  //
  //   1. Auto-assign Zadkiel/Uriel/Jophiel (if status=DRAFT)
  //   2. Dispatch (DRAFT → GENERATING)
  //   3. Generate sound prompt (Uriel)        ← melody first
  //   4. Generate lyrics (Zadkiel)            ← lyrics fit Uriel's brief
  //   5. Generate visual prompt (Jophiel)
  //   6. Generate music via MiniMax (or skip if backend=skip)
  //   7. Generate release copy (Gabriel)
  //   8. Request review (GENERATING → REVIEW)
  //
  // Returns when the issue reaches REVIEW. Total time: ~30–60s depending
  // on free-tier OpenRouter latency + MiniMax generation time.
  router.post("/suno-pipeline/:id/auto-run", validate(autoRunSchema), async (req, res) => {
    const id = paramId(req);
    const body = req.body as z.infer<typeof autoRunSchema>;
    assertCompanyAccess(req, body.companyId);

    let issue = await loadIssueOrThrow(id, body.companyId);
    const actor = getActorInfo(req);

    // Step 1: Auto-assign archangels by name (only if not already assigned)
    if (!issue.lyricsAgentId || !issue.soundAgentId || !issue.visualAgentId) {
      const [zadkiel, uriel, jophiel] = await Promise.all([
        findArchangelByName(body.companyId, "Zadkiel"),
        findArchangelByName(body.companyId, "Uriel"),
        findArchangelByName(body.companyId, "Jophiel"),
      ]);
      if (!zadkiel || !uriel || !jophiel) {
        throw unprocessable(
          "auto-run requires Zadkiel, Uriel, and Jophiel agents seeded in this company. Run the archangel seed first.",
        );
      }
      const [assigned] = await db
        .update(sunoIssues)
        .set({
          lyricsAgentId: zadkiel.id,
          soundAgentId: uriel.id,
          visualAgentId: jophiel.id,
          updatedAt: new Date(),
        })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!assigned) throw notFound("Suno issue not found");
      issue = assigned;

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.auto_run.assigned",
        entityType: "suno_issue",
        entityId: issue.id,
        details: { archangels: ["Zadkiel", "Uriel", "Jophiel"] },
      });
    }

    // Step 2: Dispatch to GENERATING (if still DRAFT)
    if (issue.status === "DRAFT") {
      const [dispatched] = await db
        .update(sunoIssues)
        .set({ status: "GENERATING", updatedAt: new Date() })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (!dispatched) throw notFound("Suno issue not found");
      issue = dispatched;

      await syncLinkedIssueStatus(issue, "GENERATING");

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.auto_run.dispatched",
        entityType: "suno_issue",
        entityId: issue.id,
        details: { previousStatus: "DRAFT", newStatus: "GENERATING" },
      });
    } else if (issue.status !== "GENERATING") {
      throw unprocessable(
        `auto-run requires status DRAFT or GENERATING; current is ${issue.status}.`,
      );
    }

    // Step 3-5: Creative chain — MELODY FIRST (Uriel → Zadkiel → Jophiel)
    //
    // CRITICAL: Wrap the entire creative chain in a try/catch. Without this,
    // an OpenRouter failure (rate-limit, bad model, network timeout) throws
    // through executeGenerateInternal → callOpenRouter and the Express global
    // error handler returns a 500 — but the song stays stuck in GENERATING
    // forever with no recovery path. The catch block below transitions the
    // song to FAILED so the kanban reflects reality and allows retry.
    try {
      issue = await executeGenerateInternal({
        issue,
        companyId: body.companyId,
        stage: "soundPrompt",
        archangelName: "Uriel",
        defaultModel: SUNO_MODELS.soundPrompt,
        build: buildSoundPromptPrompt,
        maxTokens: 600,
        hints: body.hints,
        actor,
      });
      issue = await executeGenerateInternal({
        issue,
        companyId: body.companyId,
        stage: "lyrics",
        archangelName: "Zadkiel",
        defaultModel: SUNO_MODELS.lyrics,
        build: buildLyricsPrompt,
        maxTokens: 1200,
        hints: body.hints,
        actor,
      });
      issue = await executeGenerateInternal({
        issue,
        companyId: body.companyId,
        stage: "visualPrompt",
        archangelName: "Jophiel",
        defaultModel: SUNO_MODELS.visualPrompt,
        build: buildVisualPromptPrompt,
        maxTokens: 500,
        hints: body.hints,
        actor,
      });
    } catch (creativeErr) {
      // Determine which stage we reached before the failure.
      const metaSnap = (issue.metadata ?? {}) as Record<string, unknown>;
      const stagesSnap = (metaSnap.stages && typeof metaSnap.stages === "object"
        ? (metaSnap.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const failedAt = !stagesSnap.soundPrompt
        ? "soundPrompt (Uriel)"
        : !stagesSnap.lyrics
          ? "lyrics (Zadkiel)"
          : "visualPrompt (Jophiel)";
      const errMsg = creativeErr instanceof Error ? creativeErr.message : String(creativeErr);

      await logActivity(db, {
        companyId: body.companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "suno_issue.auto_run.creative_chain_failed",
        entityType: "suno_issue",
        entityId: issue.id,
        details: { failedAt, error: errMsg, stagesCompleted: Object.keys(stagesSnap) },
      });

      // Transition to FAILED so the kanban reflects the real state.
      const failMeta = appendHistory(
        {
          ...metaSnap,
          stages: stagesSnap,
          lastFailureReason: `Creative chain failed at ${failedAt}: ${errMsg}`,
          escalation: {
            at: new Date().toISOString(),
            source: "auto-run",
            reason: `Creative chain failed at ${failedAt}`,
            error: errMsg,
          },
        },
        {
          stage: "fail",
          output: `creative chain failed at ${failedAt}`,
          at: new Date().toISOString(),
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          agentName: `auto-run (${failedAt})`,
          status: "FAILED" as SunoStatus,
        },
      );
      const [failedRow] = await db
        .update(sunoIssues)
        .set({ status: "FAILED", metadata: failMeta, updatedAt: new Date() })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (failedRow) {
        issue = failedRow;
        await syncLinkedIssueStatus(failedRow, "FAILED");
      }

      res.json({
        issue,
        readyForReview: false,
        missingStages: [failedAt],
        error: `Creative chain failed at ${failedAt}: ${errMsg}`,
      });
      return;
    }

    // Step 6: Music generation — option A parallel A/B.
    //
    // MiniMax is server-side & deterministic — fires immediately and writes
    // to the dedicated minimaxAudioUrl/minimaxSongId/minimaxStatus columns.
    // Suno is browser-side via Raziel CDP automation — populates audioUrl
    // / sunoSongId when the browser pipeline completes.
    //
    // Net effect: when both pipelines complete, the kanban card shows two
    // audio players side-by-side and Raphael picks canonAudioVariant.
    if (body.musicBackend !== "skip") {
      const meta = (issue.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const rawSoundPrompt = typeof stages.soundPrompt === "string" ? (stages.soundPrompt as string) : "";
      const lyrics = typeof stages.lyrics === "string" ? (stages.lyrics as string) : "";

      if (!rawSoundPrompt) {
        throw new Error("auto-run music: no soundPrompt in stages — run Uriel first");
      }

      // ── MiniMax (runs when backend is "minimax") ──
      if (body.musicBackend === "minimax") {
        const chakraKey = (issue.targetChakra ?? null) as ChakraKey | null;
        const prompt = buildMiniMaxPrompt(rawSoundPrompt, chakraKey, body.hints as { bpm?: number; identity?: string } | null);

        try {
          const result = await generateMinimaxMusic({
            model: MINIMAX_MUSIC_MODELS.free,
            prompt,
            lyrics: lyrics || "",
            outputUrl: true,
            isInstrumental: true,
            audioSetting: { sampleRate: 44100, bitrate: 256000, format: "mp3" },
            context: { db, companyId: body.companyId, sunoIssueId: issue.id },
          });
          if (!result.isUrl) {
            throw new Error("MiniMax returned hex audio; expected URL");
          }
          const persisted = await persistMinimaxAudio({
            db,
            companyId: body.companyId,
            audioUrl: result.audio,
            traceId: result.traceId,
            agentId: actor.agentId,
            userId: actor.actorType === "user" ? actor.actorId : null,
          });
          const minimaxSongId = result.traceId ? `minimax:${result.traceId}` : `minimax:${Date.now()}`;
          const stageCache = {
            ...stages,
            minimaxAudioUrl: persisted.contentPath,
            minimaxSongId,
            minimaxAssetId: persisted.assetId,
            minimaxOriginalUrl: result.audio,
          };
          const nextMeta = appendHistory(
            {
              ...meta,
              stages: stageCache,
              lastMusicBackend: "minimax",
              lastMusicModel: result.model,
              minimaxTraceId: result.traceId,
            },
            {
              stage: "minimaxAudioUrl",
              output: persisted.contentPath,
              at: new Date().toISOString(),
              actorType: actor.actorType,
              actorId: actor.actorId,
              agentId: actor.agentId,
              agentName: "Raziel/MiniMax",
              status: issue.status as SunoStatus,
            },
          );
          const [updated] = await db
            .update(sunoIssues)
            .set({
              minimaxAudioUrl: persisted.contentPath,
              minimaxSongId,
              minimaxStatus: result.baseStatusCode,
              metadata: nextMeta,
              updatedAt: new Date(),
            })
            .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
            .returning();
          if (!updated) throw notFound("Suno issue not found");
          issue = updated;

          await logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.auto_run.minimax_generated",
            entityType: "suno_issue",
            entityId: issue.id,
            details: {
              backend: "minimax",
              model: result.model,
              elapsedMs: result.elapsedMs,
              traceId: result.traceId,
              baseStatusCode: result.baseStatusCode,
            },
          });
        } catch (err) {
          // MiniMax gen failed — continue to release copy + leave Suno path
          // open. Issue stays in GENERATING so user can retry the music step.
          await logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.auto_run.minimax_failed",
            entityType: "suno_issue",
            entityId: issue.id,
            details: { backend: "minimax", error: err instanceof Error ? err.message : String(err) },
          });
        }
      }

      // ── Suno A-side via Raziel browser automation ──
      if (body.musicBackend === "suno") {
        try {
          const sunoResult = await generateViaSuno(rawSoundPrompt);
          const meta3 = (issue.metadata ?? {}) as Record<string, unknown>;
          const stages3 = (meta3.stages && typeof meta3.stages === "object"
            ? (meta3.stages as Record<string, unknown>)
            : {}) as Record<string, unknown>;
          const nextMeta = appendHistory(
            {
              ...meta3,
              stages: {
                ...stages3,
                audioUrl: sunoResult.audioUrl,
                sunoSongId: sunoResult.songId,
                sunoVariants: sunoResult.variants,
              },
              lastMusicBackend: "suno",
            },
            {
              stage: "audioUrl",
              output: sunoResult.audioUrl,
              at: new Date().toISOString(),
              actorType: actor.actorType,
              actorId: actor.actorId,
              agentId: actor.agentId,
              agentName: "Raziel/Suno (auto-run)",
              status: issue.status as SunoStatus,
            },
          );
          const [sunoUpdated] = await db
            .update(sunoIssues)
            .set({
              audioUrl: sunoResult.audioUrl,
              sunoSongId: sunoResult.songId,
              metadata: nextMeta,
              updatedAt: new Date(),
            })
            .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
            .returning();
          if (sunoUpdated) issue = sunoUpdated;

          await logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.auto_run.suno_generated",
            entityType: "suno_issue",
            entityId: issue.id,
            details: {
              backend: "suno",
              songId: sunoResult.songId,
              audioUrl: sunoResult.audioUrl,
            },
          });
        } catch (err) {
          // Suno failed — log but don't crash the pipeline
          await logActivity(db, {
            companyId: body.companyId,
            actorType: actor.actorType,
            actorId: actor.actorId,
            agentId: actor.agentId,
            runId: actor.runId,
            action: "suno_issue.auto_run.suno_failed",
            entityType: "suno_issue",
            entityId: issue.id,
            details: { backend: "suno", error: err instanceof Error ? err.message : String(err) },
          });
          // Don't throw — the song continues without Suno audio
        }
      }

    }

    // Step 7: Release copy (Gabriel)
    issue = await executeGenerateInternal({
      issue,
      companyId: body.companyId,
      stage: "releaseCopy",
      archangelName: "Gabriel",
      defaultModel: SUNO_MODELS.releaseCopy,
      build: buildReleaseCopyPrompt,
      maxTokens: 800,
      parseJson: true,
      hints: body.hints,
      actor,
    });

    // Step 8: Request review (only if all required stages present + audio)
    const finalMeta = (issue.metadata ?? {}) as Record<string, unknown>;
    const finalStages = (finalMeta.stages && typeof finalMeta.stages === "object"
      ? (finalMeta.stages as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const hasAudio = issue.audioUrl || issue.minimaxAudioUrl;
    const canReview =
      finalStages.lyrics &&
      finalStages.soundPrompt &&
      finalStages.visualPrompt &&
      hasAudio;

    if (canReview) {
      const [reviewed] = await db
        .update(sunoIssues)
        .set({ status: "REVIEW", updatedAt: new Date() })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (reviewed) {
        issue = reviewed;
        await syncLinkedIssueStatus(issue, "REVIEW");
        await logActivity(db, {
          companyId: body.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "suno_issue.auto_run.review_requested",
          entityType: "suno_issue",
          entityId: issue.id,
          details: { previousStatus: "GENERATING", newStatus: "REVIEW" },
        });
      }
    }

    res.json({
      issue,
      readyForReview: canReview,
      missingStages: canReview
        ? []
        : [
            !finalStages.lyrics ? "lyrics" : null,
            !finalStages.soundPrompt ? "soundPrompt" : null,
            !finalStages.visualPrompt ? "visualPrompt" : null,
            !hasAudio ? "audio (suno or minimax)" : null,
          ].filter(Boolean),
    });
  });

  // ── POST /triage ──────────────────────────────────────────────────────────
  // Batch-triage stuck GENERATING songs. Categorizes them and applies the
  // correct transition:
  //
  //   - Songs WITH audio (suno or minimax) + all creative stages → REVIEW
  //   - Songs WITH audio but missing creative stages → REVIEW (audio exists)
  //   - Songs with NO audio and stale (older than staleMinutes) → FAILED
  //   - Songs with NO audio and recent → left in GENERATING (still may be
  //     running)
  //
  // Params:
  //   companyId     — required
  //   dryRun        — if true, returns the plan without executing (default true)
  //   staleMinutes  — how old an issue must be to be considered stuck (default 30)
  //
  // Returns: { triaged: [...], summary: { promoted, failed, skipped } }
  const triageSchema = z.object({
    companyId: z.string().uuid(),
    dryRun: z.boolean().default(true),
    staleMinutes: z.number().int().positive().default(30),
  });

  router.post("/suno-pipeline/triage", validate(triageSchema), async (req, res) => {
    const body = req.body as z.infer<typeof triageSchema>;
    assertCompanyAccess(req, body.companyId);
    const actor = getActorInfo(req);

    // Load all GENERATING issues for this company.
    const rows = await db
      .select()
      .from(sunoIssues)
      .where(
        and(
          eq(sunoIssues.companyId, body.companyId),
          eq(sunoIssues.status, "GENERATING"),
        ),
      );

    const staleCutoff = new Date(Date.now() - body.staleMinutes * 60 * 1000);
    const results: Array<{
      id: string;
      concept: string;
      action: "promote_to_review" | "fail_stale" | "skip_recent";
      reason: string;
      hasAudio: boolean;
      stagesCompleted: string[];
    }> = [];

    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;

      const hasAnyAudio = !!(row.audioUrl || row.minimaxAudioUrl || stages.minimaxAudioUrl);
      const stagesCompleted = Object.keys(stages);
      const isStale = row.updatedAt ? new Date(row.updatedAt) < staleCutoff : true;

      if (hasAnyAudio) {
        // Has audio — promote to REVIEW regardless of creative stages.
        results.push({
          id: row.id,
          concept: (row.concept ?? "").slice(0, 60),
          action: "promote_to_review",
          reason: `Has audio (suno=${!!row.audioUrl}, minimax=${!!(row.minimaxAudioUrl || stages.minimaxAudioUrl)})`,
          hasAudio: true,
          stagesCompleted,
        });
      } else if (isStale) {
        // No audio and stale — transition to FAILED.
        results.push({
          id: row.id,
          concept: (row.concept ?? "").slice(0, 60),
          action: "fail_stale",
          reason: `No audio, stale since ${row.updatedAt?.toISOString?.() ?? "unknown"} (>${body.staleMinutes}m)`,
          hasAudio: false,
          stagesCompleted,
        });
      } else {
        // No audio but recent — may still be in progress.
        results.push({
          id: row.id,
          concept: (row.concept ?? "").slice(0, 60),
          action: "skip_recent",
          reason: `No audio but updated recently (within ${body.staleMinutes}m), may still be running`,
          hasAudio: false,
          stagesCompleted,
        });
      }
    }

    // Execute transitions if not a dry run.
    let promoted = 0;
    let failed = 0;
    let skipped = 0;

    if (!body.dryRun) {
      for (const r of results) {
        if (r.action === "promote_to_review") {
          const [updated] = await db
            .update(sunoIssues)
            .set({ status: "REVIEW", updatedAt: new Date() })
            .where(and(eq(sunoIssues.id, r.id), eq(sunoIssues.companyId, body.companyId)))
            .returning();
          if (updated) {
            await syncLinkedIssueStatus(updated, "REVIEW");
            await logActivity(db, {
              companyId: body.companyId,
              actorType: actor.actorType,
              actorId: actor.actorId,
              agentId: actor.agentId,
              runId: actor.runId,
              action: "suno_issue.triage.promoted_to_review",
              entityType: "suno_issue",
              entityId: r.id,
              details: { reason: r.reason, stagesCompleted: r.stagesCompleted },
            });
            promoted++;
          }
        } else if (r.action === "fail_stale") {
          // Load the issue to get current metadata for the history append.
          const [current] = await db
            .select()
            .from(sunoIssues)
            .where(and(eq(sunoIssues.id, r.id), eq(sunoIssues.companyId, body.companyId)));
          if (current) {
            const curMeta = (current.metadata ?? {}) as Record<string, unknown>;
            const failMeta = appendHistory(
              {
                ...curMeta,
                lastFailureReason: `Triage: ${r.reason}`,
                triagedAt: new Date().toISOString(),
              },
              {
                stage: "fail",
                output: `triage: stale GENERATING with no audio`,
                at: new Date().toISOString(),
                actorType: actor.actorType,
                actorId: actor.actorId,
                agentId: actor.agentId,
                agentName: "Metatron (triage)",
                status: "FAILED" as SunoStatus,
              },
            );
            const [updated] = await db
              .update(sunoIssues)
              .set({ status: "FAILED", metadata: failMeta, updatedAt: new Date() })
              .where(and(eq(sunoIssues.id, r.id), eq(sunoIssues.companyId, body.companyId)))
              .returning();
            if (updated) {
              await syncLinkedIssueStatus(updated, "FAILED");
              await logActivity(db, {
                companyId: body.companyId,
                actorType: actor.actorType,
                actorId: actor.actorId,
                agentId: actor.agentId,
                runId: actor.runId,
                action: "suno_issue.triage.failed_stale",
                entityType: "suno_issue",
                entityId: r.id,
                details: { reason: r.reason, stagesCompleted: r.stagesCompleted },
              });
              failed++;
            }
          }
        } else {
          skipped++;
        }
      }
    } else {
      promoted = results.filter((r) => r.action === "promote_to_review").length;
      failed = results.filter((r) => r.action === "fail_stale").length;
      skipped = results.filter((r) => r.action === "skip_recent").length;
    }

    res.json({
      dryRun: body.dryRun,
      staleMinutes: body.staleMinutes,
      triaged: results,
      summary: { total: results.length, promoted, failed, skipped },
    });
  });

  // ── GET /:id/timeline ─────────────────────────────────────────────────────
  // Read activity-log rows scoped to this song, ascending by time. Useful
  // for the song detail page and Metatron's records.
  router.get("/suno-pipeline/:id/timeline", async (req, res) => {
    const id = paramId(req);
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    // Confirm ownership before exposing activity rows.
    await loadIssueOrThrow(id, companyId);

    const rows = await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.companyId, companyId),
          eq(activityLog.entityType, "suno_issue"),
          eq(activityLog.entityId, id),
        ),
      )
      .orderBy(asc(activityLog.createdAt));

    res.json(rows);
  });

  return router;
}
