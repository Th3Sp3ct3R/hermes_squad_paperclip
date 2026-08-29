/**
 * Suno Publish Scheduler — auto-publishes APPROVED songs at scheduledPublishAt.
 *
 * Ticks every 60s, finds APPROVED rows where scheduledPublishAt <= now(),
 * flips them to PUBLISHED, stamps publishedAt, mirrors to linked issues,
 * logs activity, emits live events. Idempotent — clearing scheduledPublishAt
 * after publish prevents double-fire.
 *
 * Lives alongside `cron.ts` / `plugin-job-scheduler.ts` but is dedicated to
 * the Suno state machine so it doesn't hijack generic plugin scheduling.
 */

import { and, eq, lte, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { sunoIssues } from "@paperclipai/db";
import { issues } from "@paperclipai/db";
import { logActivity } from "./index.js";
import { logger } from "../middleware/logger.js";

export interface SunoPublishSchedulerOptions {
  intervalMs?: number; // default 60_000
  batchLimit?: number; // max rows per tick, default 100
}

function buildIssuePatch(nextStatus: string) {
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updatedAt: new Date(),
  };
  if (nextStatus === "done") {
    (patch as Record<string, Date>).completedAt = new Date();
  }
  return patch;
}

export function createSunoPublishScheduler(db: Db, opts: SunoPublishSchedulerOptions = {}) {
  const intervalMs = opts.intervalMs ?? 60_000;
  const batchLimit = opts.batchLimit ?? 100;
  let handle: NodeJS.Timeout | null = null;
  let ticking = false;

  async function tickOnce(now = new Date()) {
    if (ticking) return { published: 0, skipped: 0 };
    ticking = true;
    try {
      const due = await db
        .select()
        .from(sunoIssues)
        .where(and(eq(sunoIssues.status, "APPROVED"), isNotNull(sunoIssues.scheduledPublishAt), lte(sunoIssues.scheduledPublishAt, now)))
        .limit(batchLimit);

      if (due.length === 0) return { published: 0, skipped: 0 };

      let published = 0;
      for (const row of due) {
        try {
          const [updated] = await db
            .update(sunoIssues)
            .set({
              status: "PUBLISHED",
              scheduledPublishAt: null,
              publishedAt: now,
              updatedAt: now,
            })
            .where(and(eq(sunoIssues.id, row.id), eq(sunoIssues.status, "APPROVED")))
            .returning({ id: sunoIssues.id, companyId: sunoIssues.companyId, status: sunoIssues.status });

          if (!updated) continue; // raced with manual publish / unschedule
          published += 1;

          // Mirror to linked unified issue (best-effort)
          if (row.issueId) {
            try {
              await db
                .update(issues)
                .set(buildIssuePatch("done") as never)
                .where(and(eq(issues.id, row.issueId), eq(issues.companyId, row.companyId)));
            } catch (e) {
              logger.warn({ err: e, sunoId: row.id }, "[suno-scheduler] linked issue mirror failed");
            }
          }

          await logActivity(db, {
            companyId: row.companyId,
            actorType: "system",
            actorId: "suno-scheduler",
            agentId: null,
            runId: null,
            action: "suno_issue.published",
            entityType: "suno_issue",
            entityId: row.id,
            details: {
              previousStatus: "APPROVED",
              newStatus: "PUBLISHED",
              scheduled: true,
              scheduledPublishAt: row.scheduledPublishAt?.toISOString() ?? null,
              publishedAt: now.toISOString(),
            },
          });

          // Publish live event so UI updates without refresh (best-effort)
          try {
            const { publishLiveEvent } = await import("./live-events.js");
            publishLiveEvent({ companyId: row.companyId, type: "suno_issue.published" as never, payload: { sunoIssueId: row.id } });
          } catch {
            // live event is optional
          }

          // Bridge → engager (best-effort webhook)
          try {
            const { notifyEngagerOnPublish } = await import("./suno-engager-webhook.js");
            await notifyEngagerOnPublish({
              event: "suno_issue.published",
              at: now.toISOString(),
              companyId: row.companyId,
              sunoIssueId: row.id,
              audioUrl: (row as { audioUrl?: string | null }).audioUrl ?? null,
              thumbnailUrl: (row as { thumbnailUrl?: string | null }).thumbnailUrl ?? null,
              videoUrl: (row as { videoUrl?: string | null }).videoUrl ?? null,
              minimaxAudioUrl: (row as { minimaxAudioUrl?: string | null }).minimaxAudioUrl ?? null,
              canonAudioVariant: (row as { canonAudioVariant?: string | null }).canonAudioVariant ?? null,
              targetChakra: (row as { targetChakra?: string }).targetChakra ?? "UNKNOWN",
              targetFrequency: (row as { targetFrequency?: number }).targetFrequency ?? 0,
              genre: (row as { genre?: string | null }).genre ?? null,
              concept: (row as { concept?: string }).concept ?? "",
              scheduled: true,
              publishTargets: (row as { publishTargets?: string[] | null }).publishTargets ?? null,
            });
          } catch {
            // engager webhook is optional
          }
        } catch (e) {
          logger.error({ err: e, sunoId: row.id }, "[suno-scheduler] publish tick failed for row");
        }
      }

      if (published > 0) logger.info({ published, totalDue: due.length }, "[suno-scheduler] published due songs");
      return { published, skipped: due.length - published };
    } finally {
      ticking = false;
    }
  }

  return {
    start() {
      if (handle) return;
      logger.info({ intervalMs }, "[suno-scheduler] starting");
      // jitter initial tick 5-15s so scheduler doesn't thunder with plugin scheduler at :00
      const jitter = 5000 + Math.floor(Math.random() * 10000);
      setTimeout(() => {
        tickOnce().catch((e) => logger.error({ err: e }, "[suno-scheduler] initial tick failed"));
      }, jitter);
      handle = setInterval(() => {
        tickOnce().catch((e) => logger.error({ err: e }, "[suno-scheduler] tick failed"));
      }, intervalMs);
      // allow process to exit cleanly in tests
      if (handle.unref) handle.unref();
    },
    stop() {
      if (!handle) return;
      clearInterval(handle);
      handle = null;
      logger.info("[suno-scheduler] stopped");
    },
    /** Exposed for tests / manual trigger: run one tick synchronously */
    tickOnce,
    /** For health checks */
    getStatus() {
      return { running: handle !== null, intervalMs, batchLimit };
    },
  };
}

export type SunoPublishScheduler = ReturnType<typeof createSunoPublishScheduler>;
