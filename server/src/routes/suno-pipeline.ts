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
