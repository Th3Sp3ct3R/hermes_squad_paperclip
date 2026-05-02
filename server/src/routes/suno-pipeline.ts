/**
 * Suno pipeline routes — CRUD for the autonomous music production pipeline.
 *
 *   GET    /api/suno-pipeline?companyId=...        list issues for a company
 *   POST   /api/suno-pipeline                      create a new pipeline issue
 *   PATCH  /api/suno-pipeline/:id?companyId=...    update status / URLs / agent assignments
 *
 * All routes are company-scoped via assertCompanyAccess. Mutations are
 * logged through the standard activity-log pipeline so they show up in
 * the dashboard activity feed and live-event stream.
 */
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  sunoIssues,
  SUNO_CHAKRAS,
  SUNO_STATUSES,
  SUNO_CHAKRA_FREQUENCIES,
} from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { badRequest, notFound } from "../errors.js";

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

export function sunoPipelineRoutes(db: Db) {
  const router = Router();

  // ── GET /suno-pipeline ────────────────────────────────────────────────────
  router.get("/suno-pipeline", async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      assertCompanyAccess(req, companyId);

      const rows = await db
        .select()
        .from(sunoIssues)
        .where(eq(sunoIssues.companyId, companyId))
        .orderBy(desc(sunoIssues.createdAt));

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
    const rawId = req.params.id;
    // Express's `req.params[key]` is typed as `string | string[]` under strict
    // settings; narrow before passing to Drizzle's eq().
    if (typeof rawId !== "string" || !rawId) {
      throw badRequest("id is required");
    }
    const id: string = rawId;

    const body = req.body as z.infer<typeof updateSchema>;
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const [existing] = await db
      .select()
      .from(sunoIssues)
      .where(and(eq(sunoIssues.id, id), eq(sunoIssues.companyId, companyId)))
      .limit(1);
    if (!existing) throw notFound("Suno issue not found");

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

  return router;
}
