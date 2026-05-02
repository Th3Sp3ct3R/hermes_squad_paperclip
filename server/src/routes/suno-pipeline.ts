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
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  sunoIssues,
  agents as agentsTable,
  activityLog,
  SUNO_CHAKRAS,
  SUNO_STATUSES,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoStatus,
} from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/index.js";
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
  type MinimaxMusicModel,
} from "../services/minimax-music.js";
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
   *   - "parallel" — option A A/B: MiniMax fires now + Suno dispatch flagged
   *                  for Raziel browser automation (writes to minimaxAudioUrl
   *                  and audioUrl independently)
   *   - "skip"     — no music gen, leave both url columns null for manual
   */
  musicBackend: z.enum(["minimax", "parallel", "skip"]).default("parallel"),
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
  //   CRUD
  // ────────────────────────────────────────────────────────────────────────

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

    res.status(201).json(row);
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

      if (!prompt || !lyrics) {
        throw unprocessable(
          "dispatch-minimax requires prompt + lyrics — generate Uriel/Zadkiel stages first or pass them in the body",
        );
      }

      let result: Awaited<ReturnType<typeof generateMinimaxMusic>>;
      try {
        result = await generateMinimaxMusic({
          model: body.model ?? MINIMAX_MUSIC_MODELS.free,
          prompt,
          lyrics,
          outputUrl: true,
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
      const minimaxSongId = result.traceId
        ? `minimax:${result.traceId}`
        : `minimax:${Date.now()}`;
      const nextMeta = appendHistory(
        {
          ...meta,
          stages: { ...stages, minimaxAudioUrl: result.audio, minimaxSongId },
          lastMusicBackend: "minimax",
          lastMusicModel: result.model,
          minimaxTraceId: result.traceId,
        },
        {
          stage: "minimaxAudioUrl",
          output: result.audio,
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
          minimaxAudioUrl: result.audio,
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
      if (!lyrics) {
        throw unprocessable(
          "MiniMax music gen requires lyrics — deposit them first via /generate/lyrics or /deposit.",
        );
      }

      let result;
      try {
        result = await generateMinimaxMusic({
          model: (body.model as MinimaxMusicModel | undefined) ?? MINIMAX_MUSIC_MODELS.free,
          prompt,
          lyrics,
          outputUrl: true,
          isInstrumental: body.isInstrumental,
        });
      } catch (err) {
        throw badRequest(
          `MiniMax music generation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (!result.isUrl) {
        throw badRequest("MiniMax returned hex audio; expected URL");
      }

      // Deposit audioUrl + tag the song id so we can tell which path produced it.
      const sunoSongId = `minimax:${(result.extra?.["trace_id"] as string) ?? Date.now()}`;
      const stageCache = { ...stages, audioUrl: result.audio, sunoSongId };
      const nextMeta = appendHistory(
        { ...meta, stages: stageCache, lastMusicBackend: "minimax", lastMusicModel: result.model },
        {
          stage: "audioUrl",
          output: result.audio,
          at: new Date().toISOString(),
          actorType: getActorInfo(req).actorType,
          actorId: getActorInfo(req).actorId,
          agentId: getActorInfo(req).agentId,
          agentName: "Raziel/MiniMax",
          status: issue.status as SunoStatus,
        },
      );

      const [row] = await db
        .update(sunoIssues)
        .set({
          audioUrl: result.audio,
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
          imageSize: body.imageSize ?? "1K",
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

    const raw = await callOpenRouter({ model, messages, maxTokens: args.maxTokens });
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

    // Step 6: Music generation — option A parallel A/B.
    //
    // MiniMax is server-side & deterministic — fires immediately and writes
    // to the dedicated minimaxAudioUrl/minimaxSongId/minimaxStatus columns.
    // Suno is browser-side via Raziel (no public API) — populates audioUrl
    // / sunoSongId asynchronously when Raziel runs the browser automation.
    //
    // Net effect: when both pipelines complete, the kanban card shows two
    // audio players side-by-side and Raphael picks canonAudioVariant.
    if (body.musicBackend === "minimax" || body.musicBackend === "parallel") {
      const meta = (issue.metadata ?? {}) as Record<string, unknown>;
      const stages = (meta.stages && typeof meta.stages === "object"
        ? (meta.stages as Record<string, unknown>)
        : {}) as Record<string, unknown>;
      const prompt = typeof stages.soundPrompt === "string" ? (stages.soundPrompt as string) : "";
      const lyrics = typeof stages.lyrics === "string" ? (stages.lyrics as string) : "";

      try {
        const result = await generateMinimaxMusic({
          model: MINIMAX_MUSIC_MODELS.free,
          prompt,
          lyrics,
          outputUrl: true,
        });
        if (!result.isUrl) {
          throw new Error("MiniMax returned hex audio; expected URL");
        }
        const minimaxSongId = result.traceId ? `minimax:${result.traceId}` : `minimax:${Date.now()}`;
        const stageCache = { ...stages, minimaxAudioUrl: result.audio, minimaxSongId };
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
            output: result.audio,
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
            minimaxAudioUrl: result.audio,
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

      // When parallel mode is requested, also flag the Suno (A-side) path
      // as ready for Raziel's browser dispatch. We don't have a Suno HTTP
      // API, so this is a marker the browser-side worker picks up next run.
      if (body.musicBackend === "parallel") {
        const meta2 = (issue.metadata ?? {}) as Record<string, unknown>;
        const nextMeta2 = {
          ...meta2,
          sunoDispatchPending: true,
          sunoDispatchPendingAt: new Date().toISOString(),
        };
        const [flagged] = await db
          .update(sunoIssues)
          .set({ metadata: nextMeta2, updatedAt: new Date() })
          .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
          .returning();
        if (flagged) issue = flagged;

        await logActivity(db, {
          companyId: body.companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "suno_issue.auto_run.suno_dispatch_pending",
          entityType: "suno_issue",
          entityId: issue.id,
          details: { reason: "parallel A/B mode — awaiting Raziel browser run" },
        });
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
    const canReview =
      finalStages.lyrics &&
      finalStages.soundPrompt &&
      finalStages.visualPrompt &&
      issue.audioUrl;

    if (canReview) {
      const [reviewed] = await db
        .update(sunoIssues)
        .set({ status: "REVIEW", updatedAt: new Date() })
        .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, body.companyId)))
        .returning();
      if (reviewed) {
        issue = reviewed;
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
            !issue.audioUrl ? "audioUrl" : null,
          ].filter(Boolean),
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
