/**
 * Cassiel — the Saturn-archangel of time, solitude, and watching.
 *
 * Cassiel's job in the Hermes Squad is to be the stuck-batch reaper.
 * Every N minutes he scans suno_issues for rows that have sat in
 * GENERATING for too long with no audio, no thumbnail, no recent
 * activity — and either:
 *   1. fires the batch's /execute endpoint (if there's a batchId
 *      and no recent attempt)
 *   2. flips them to FAILED with a reason if they've been stuck for
 *      a hard limit (e.g. > 6 hours)
 *
 * Every scan creates a heartbeat_runs row attributed to Cassiel so the
 * dashboard can show "Cassiel · last pulse 47s ago."
 */
import { logger } from "../middleware/logger.js";
import {
  agents,
  sunoIssues,
  activityLog,
  type Db,
} from "@paperclipai/db";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { withArchangelRun } from "./archangel-heartbeat.js";
import { agentMessagesService } from "./agent-messages.js";

const STUCK_THRESHOLD_MINUTES = 10; // older than this and still GENERATING → suspect
const HARD_FAIL_THRESHOLD_HOURS = 6; // older than this → flip to FAILED

export interface CassielScanResult {
  scannedAt: Date;
  totalGenerating: number;
  stuckCount: number;
  hardFailCount: number;
  rescuedBatches: string[];
  failedIssueIds: string[];
}

/**
 * Run one scan pass. Should be called every 5 minutes by a scheduler.
 */
export async function runCassielScan(
  db: Db,
  companyId: string,
): Promise<CassielScanResult> {
  return withArchangelRun(
    {
      db,
      companyId,
      archangelName: "Cassiel",
      action: "scan.stuck-batches",
      contextSnapshot: { stuckThresholdMin: STUCK_THRESHOLD_MINUTES },
    },
    async () => {
      const now = new Date();
      const stuckCutoff = new Date(now.getTime() - STUCK_THRESHOLD_MINUTES * 60_000);
      const failCutoff = new Date(
        now.getTime() - HARD_FAIL_THRESHOLD_HOURS * 60 * 60_000,
      );

      // 1. Find all GENERATING issues
      const generating = await db
        .select()
        .from(sunoIssues)
        .where(
          and(
            eq(sunoIssues.companyId, companyId),
            eq(sunoIssues.status, "GENERATING"),
          ),
        );

      const stuck = generating.filter(
        (i) =>
          (i.updatedAt ?? i.createdAt) < stuckCutoff &&
          !i.audioUrl &&
          !i.minimaxAudioUrl,
      );
      const hardFail = stuck.filter(
        (i) => (i.updatedAt ?? i.createdAt) < failCutoff,
      );

      logger.info(
        {
          totalGenerating: generating.length,
          stuckCount: stuck.length,
          hardFailCount: hardFail.length,
        },
        "[cassiel] scan complete",
      );

      // 2. Hard-fail anything stuck > 6h. Cassiel doesn't grovel.
      const failedIds: string[] = [];
      for (const i of hardFail) {
        await db
          .update(sunoIssues)
          .set({
            status: "FAILED",
            metadata: {
              ...((i.metadata ?? {}) as Record<string, unknown>),
              cassielReaped: {
                at: now.toISOString(),
                reason: `Stuck in GENERATING > ${HARD_FAIL_THRESHOLD_HOURS}h with no audio`,
              },
            },
            updatedAt: now,
          })
          .where(eq(sunoIssues.id, i.id));
        await db.insert(activityLog).values({
          companyId,
          actorType: "agent",
          actorId: "cassiel-watcher",
          agentId: null, // Cassiel agent_id wired by withArchangelRun via heartbeat_runs
          action: "suno_issue.cassiel_reaped",
          entityType: "suno_issue",
          entityId: i.id,
          details: {
            reason: `Stuck > ${HARD_FAIL_THRESHOLD_HOURS}h`,
            stuckSinceMs: now.getTime() - (i.updatedAt ?? i.createdAt).getTime(),
          },
        });
        failedIds.push(i.id);
      }

      // 3. Recoverable stuck — group by batchId, log a recovery candidate.
      // Actual /batch/:id/execute kick is left to the operator OR a separate
      // self-heal route — this scan only surfaces what's stuck so the
      // dashboard can show it. Auto-firing execute would burn credits
      // unconditionally, which we don't want until you top up OpenRouter.
      const batchIds = new Set<string>();
      for (const i of stuck) {
        if (failedIds.includes(i.id)) continue;
        const meta = (i.metadata ?? {}) as Record<string, unknown>;
        const batchId = typeof meta.batchId === "string" ? meta.batchId : null;
        if (batchId) batchIds.add(batchId);
      }
      // Resolve Cassiel + Michael agent ids once for the message channel below.
      const [cassielRow] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), eq(agents.name, "Cassiel")))
        .limit(1);
      const [michaelRow] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), eq(agents.name, "Michael")))
        .limit(1);
      const messages = agentMessagesService(db);

      for (const batchId of batchIds) {
        const witness = stuck.find(
          (s) =>
            ((s.metadata ?? {}) as Record<string, unknown>).batchId === batchId,
        );
        if (!witness) continue;
        const stuckCount = stuck.filter(
          (s) =>
            ((s.metadata ?? {}) as Record<string, unknown>).batchId === batchId,
        ).length;

        await db.insert(activityLog).values({
          companyId,
          actorType: "agent",
          actorId: "cassiel-watcher",
          action: "suno_issue.cassiel_stuck_batch_detected",
          entityType: "suno_issue",
          entityId: witness.id,
          details: { batchId, stuckCount },
        });

        // Open an agent_message thread Cassiel→Michael — this is what makes
        // the alert actionable. Michael's inbox now has a request he can
        // respond to (re-fire execute, or escalate to user).
        if (cassielRow && michaelRow) {
          await messages
            .send({
              companyId,
              fromAgentId: cassielRow.id,
              toAgentId: michaelRow.id,
              kind: "alert",
              subject: `Stuck batch ${batchId.slice(0, 12)}…`,
              body: `Commander, the working **${batchId}** has been seated in GENERATING for over ${STUCK_THRESHOLD_MINUTES} minutes. ${stuckCount} issue${stuckCount > 1 ? "s" : ""} have not produced audio. Either fire \`POST /api/suno-pipeline/batch/${batchId}/execute\` or surface to the operator.`,
              bodyMeta: {
                batchId,
                stuckCount,
                witnessIssueId: witness.id,
              },
              entityType: "suno_issue",
              entityId: witness.id,
            })
            .catch((err) =>
              logger.warn(
                { err: err instanceof Error ? err.message : String(err) },
                "[cassiel] failed to message Michael — non-fatal",
              ),
            );
        }
      }

      return {
        scannedAt: now,
        totalGenerating: generating.length,
        stuckCount: stuck.length,
        hardFailCount: hardFail.length,
        rescuedBatches: Array.from(batchIds),
        failedIssueIds: failedIds,
      };
    },
  );
}

/**
 * Start Cassiel's scan loop. Runs once immediately, then every
 * `intervalMinutes` after that. Returns a stop function.
 */
export function startCassielWatcher(
  db: Db,
  options: { companyId: string; intervalMinutes?: number } = { companyId: "" },
): () => void {
  const interval = (options.intervalMinutes ?? 5) * 60_000;
  if (!options.companyId) {
    logger.warn("[cassiel] no companyId provided, watcher not started");
    return () => {};
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (stopped) return;
    try {
      await runCassielScan(db, options.companyId);
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[cassiel] scan failed",
      );
    }
    if (!stopped) timer = setTimeout(tick, interval);
  }
  // Fire first tick after a short delay so server boot doesn't compete
  // for DB connections during startup.
  timer = setTimeout(tick, 30_000);
  logger.info(
    { intervalMinutes: options.intervalMinutes ?? 5, companyId: options.companyId },
    "[cassiel] watcher started",
  );

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
