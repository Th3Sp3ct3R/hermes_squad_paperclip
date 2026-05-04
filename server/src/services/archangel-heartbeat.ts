/**
 * Archangel Heartbeat — a thin wrapper that gives every Suno-pipeline LLM
 * call a real heartbeat trail. Without this, every Uriel/Zadkiel/Jophiel/
 * Gabriel/Raziel/Sandalphon/Cassiel call ran with `agent_id = null` and
 * the dashboard had no way to know the archangel was actually doing work.
 *
 * What it writes:
 *   1. heartbeat_runs row  (status=running → succeeded|failed)
 *   2. heartbeat_run_events  (lifecycle: started, completed, error)
 *   3. agent_runtime_state.last_seen_at  (so "last pulse 6s ago" works)
 *   4. agents.status  (idle → running → idle | error)
 *
 * The full heartbeatService in heartbeat.ts is intentionally bypassed —
 * that one expects a real subprocess adapter.execute() flow with
 * external_run_id, exit_code, signal, etc. Archangels don't fork
 * processes; they invoke LLMs. This wrapper is the right abstraction.
 *
 * Caches agent_id-by-name lookups in-process so the typical "20 LLM
 * calls per song generation" doesn't hammer the agents table.
 */
import { logger } from "../middleware/logger.js";
import {
  agents,
  agentRuntimeState,
  heartbeatRuns,
  heartbeatRunEvents,
  type Db,
} from "@paperclipai/db";
import { and, eq } from "drizzle-orm";

export type ArchangelName =
  | "Metatron"
  | "Michael"
  | "Uriel"
  | "Zadkiel"
  | "Jophiel"
  | "Raziel"
  | "Raphael"
  | "Gabriel"
  | "Sandalphon"
  | "Cassiel";

export interface ArchangelRunContext {
  db: Db;
  companyId: string;
  archangelName: ArchangelName;
  /** What the archangel is doing this run. e.g. "generate.soundPrompt" */
  action: string;
  /** Optional payload snapshot for the heartbeat row's context_snapshot col. */
  contextSnapshot?: Record<string, unknown>;
  /** Optional sunoIssue UUID this run is operating on. */
  sunoIssueId?: string;
}

export interface ArchangelRunHandle {
  runId: string;
  agentId: string;
  startedAt: Date;
}

/**
 * Per-process cache: { `${companyId}::${archangelName}` → { id, adapterType } }.
 * Filled lazily on first lookup; agents are stable for a session.
 */
const AGENT_LOOKUP_CACHE = new Map<string, { id: string; adapterType: string }>();

async function lookupArchangelAgent(
  db: Db,
  companyId: string,
  archangelName: ArchangelName,
): Promise<{ id: string; adapterType: string } | null> {
  const cacheKey = `${companyId}::${archangelName}`;
  const cached = AGENT_LOOKUP_CACHE.get(cacheKey);
  if (cached) return cached;
  const rows = await db
    .select({ id: agents.id, adapterType: agents.adapterType })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), eq(agents.name, archangelName)))
    .limit(1);
  if (!rows[0]) return null;
  AGENT_LOOKUP_CACHE.set(cacheKey, rows[0]);
  return rows[0];
}

/**
 * Begin an archangel run. Returns a handle with the runId — caller MUST
 * pass that to {@link finishArchangelRun} or {@link failArchangelRun}
 * (one or the other) so the run doesn't sit in 'running' forever.
 *
 * Prefer the convenience wrapper {@link withArchangelRun} which
 * guarantees one of those two calls fires via try/finally.
 */
export async function startArchangelRun(
  ctx: ArchangelRunContext,
): Promise<ArchangelRunHandle | null> {
  const archangelAgent = await lookupArchangelAgent(
    ctx.db,
    ctx.companyId,
    ctx.archangelName,
  );
  if (!archangelAgent) {
    logger.warn(
      { archangelName: ctx.archangelName, companyId: ctx.companyId },
      "[archangel-heartbeat] no agent row for archangel — skipping heartbeat",
    );
    return null;
  }
  const { id: agentId, adapterType } = archangelAgent;
  const startedAt = new Date();

  const [run] = await ctx.db
    .insert(heartbeatRuns)
    .values({
      companyId: ctx.companyId,
      agentId,
      invocationSource: "automation",
      status: "running",
      startedAt,
      contextSnapshot: {
        archangelName: ctx.archangelName,
        action: ctx.action,
        sunoIssueId: ctx.sunoIssueId,
        ...ctx.contextSnapshot,
      },
      triggerDetail: `suno-pipeline.${ctx.action}`,
    })
    .returning();
  if (!run) {
    logger.error("[archangel-heartbeat] heartbeat_runs insert returned no row");
    return null;
  }

  await ctx.db.insert(heartbeatRunEvents).values({
    runId: run.id,
    companyId: ctx.companyId,
    agentId,
    seq: 1,
    eventType: "lifecycle",
    message: `${ctx.archangelName} ${ctx.action} started`,
    payload: { phase: "started", action: ctx.action },
  });

  await upsertRuntimeState(ctx.db, ctx.companyId, agentId, adapterType, {
    lastRunId: run.id,
    lastRunStatus: "running",
    updatedAt: startedAt,
  });

  await ctx.db.update(agents).set({ status: "running" }).where(eq(agents.id, agentId));

  return { runId: run.id, agentId, startedAt };
}

export async function finishArchangelRun(
  db: Db,
  companyId: string,
  handle: ArchangelRunHandle,
  result?: Record<string, unknown>,
): Promise<void> {
  const finishedAt = new Date();
  await db
    .update(heartbeatRuns)
    .set({
      status: "succeeded",
      finishedAt,
      resultJson: result ?? null,
      updatedAt: finishedAt,
    })
    .where(eq(heartbeatRuns.id, handle.runId));
  await db.insert(heartbeatRunEvents).values({
    runId: handle.runId,
    companyId,
    agentId: handle.agentId,
    seq: 2,
    eventType: "lifecycle",
    message: "completed",
    payload: {
      phase: "completed",
      durationMs: finishedAt.getTime() - handle.startedAt.getTime(),
    },
  });
  // Look up adapterType from cache for runtime-state update
  const cachedAdapter = await getCachedAdapter(db, handle.agentId);
  await upsertRuntimeState(db, companyId, handle.agentId, cachedAdapter, {
    lastRunId: handle.runId,
    lastRunStatus: "succeeded",
    updatedAt: finishedAt,
  });
  await db.update(agents).set({ status: "idle" }).where(eq(agents.id, handle.agentId));
}

export async function failArchangelRun(
  db: Db,
  companyId: string,
  handle: ArchangelRunHandle,
  err: unknown,
): Promise<void> {
  const finishedAt = new Date();
  const message = err instanceof Error ? err.message : String(err);
  await db
    .update(heartbeatRuns)
    .set({
      status: "failed",
      finishedAt,
      error: message.slice(0, 4000),
      updatedAt: finishedAt,
    })
    .where(eq(heartbeatRuns.id, handle.runId));
  await db.insert(heartbeatRunEvents).values({
    runId: handle.runId,
    companyId,
    agentId: handle.agentId,
    seq: 2,
    eventType: "error",
    level: "error",
    message: message.slice(0, 1000),
    payload: {
      phase: "failed",
      message: message.slice(0, 1000),
      durationMs: finishedAt.getTime() - handle.startedAt.getTime(),
    },
  });
  const cachedAdapter = await getCachedAdapter(db, handle.agentId);
  await upsertRuntimeState(db, companyId, handle.agentId, cachedAdapter, {
    lastRunId: handle.runId,
    lastRunStatus: "failed",
    updatedAt: finishedAt,
    lastError: message.slice(0, 2000),
  });
  await db.update(agents).set({ status: "error" }).where(eq(agents.id, handle.agentId));
}

async function getCachedAdapter(db: Db, agentId: string): Promise<string> {
  for (const v of AGENT_LOOKUP_CACHE.values()) if (v.id === agentId) return v.adapterType;
  const rows = await db
    .select({ adapterType: agents.adapterType })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  return rows[0]?.adapterType ?? "process";
}

/**
 * Convenience wrapper — guarantees one of finish/fail fires regardless of
 * whether the inner function throws. Use this for ~all callsites.
 */
export async function withArchangelRun<T>(
  ctx: ArchangelRunContext,
  fn: () => Promise<T>,
): Promise<T> {
  const handle = await startArchangelRun(ctx);
  if (!handle) {
    // Heartbeat couldn't start (no agent row). Don't fail the whole call —
    // just run the work without telemetry. Logged in startArchangelRun.
    return fn();
  }
  try {
    const result = await fn();
    await finishArchangelRun(ctx.db, ctx.companyId, handle, {
      action: ctx.action,
      ok: true,
    }).catch((e) =>
      logger.warn({ err: e }, "[archangel-heartbeat] finish failed (non-fatal)"),
    );
    return result;
  } catch (err) {
    await failArchangelRun(ctx.db, ctx.companyId, handle, err).catch((e) =>
      logger.warn({ err: e }, "[archangel-heartbeat] fail failed (non-fatal)"),
    );
    throw err;
  }
}

async function upsertRuntimeState(
  db: Db,
  companyId: string,
  agentId: string,
  adapterType: string,
  patch: {
    lastRunId: string | null;
    lastRunStatus: "running" | "succeeded" | "failed";
    updatedAt: Date;
    lastError?: string;
  },
): Promise<void> {
  // agent_runtime_state has agentId PK. Try update first; if no row, insert.
  // updatedAt is the dashboard's "last pulse" source (no separate last_seen_at column).
  const result = await db
    .update(agentRuntimeState)
    .set({
      lastRunId: patch.lastRunId,
      lastRunStatus: patch.lastRunStatus,
      updatedAt: patch.updatedAt,
      ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
    })
    .where(eq(agentRuntimeState.agentId, agentId))
    .returning({ agentId: agentRuntimeState.agentId });

  if (result.length === 0) {
    await db
      .insert(agentRuntimeState)
      .values({
        agentId,
        companyId,
        adapterType,
        lastRunId: patch.lastRunId,
        lastRunStatus: patch.lastRunStatus,
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
      })
      .onConflictDoNothing();
  }
}
