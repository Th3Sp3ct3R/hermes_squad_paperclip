/**
 * Hermetic Panels — Phase 1 of The Observatory's deeper telemetry.
 *
 * Five small cards rendered as one row, each derived from data the Dashboard
 * already fetches (sunoIssues + activity log + heartbeats). They reframe the
 * pipeline through the Hermetic / alchemical lens:
 *
 *   The Magnum Opus    — funnel of songs by alchemical stage
 *   Solve et Coagula   — dissolution → coagulation cycles (rejected→reworked→approved)
 *   The Eighth Sphere  — songs that broke through Fate (shipped)
 *   Hermes' Errands    — tool-call ledger today
 *   The Ouroboros      — retry loops + self-healing events
 *
 * Data sources — best-effort. Empty datasets gracefully show ` — `.
 */
import { useMemo } from "react";
import { CaduceusMark } from "../CaduceusMark";
import { cn } from "@/lib/utils";

type SunoIssueLike = {
  id: string;
  status: string;
  audioUrl: string | null;
  minimaxAudioUrl: string | null;
  canonAudioVariant: string | null;
  updatedAt: string | Date;
};

type ActivityLike = {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  createdAt: string | Date;
  details?: Record<string, unknown> | null;
};

type RunLike = {
  agentId?: string;
  status?: string;
  startedAt?: string | Date;
  finishedAt?: string | Date;
};

// ── 1. The Magnum Opus ────────────────────────────────────────────────────
// Funnel of songs by alchemical stage. Each sunoStatus maps to a stage in
// the opus arc. Reuses the same color register the kanban already uses.

interface MagnumOpusPanelProps {
  sunoIssues?: SunoIssueLike[] | null;
}

const OPUS_STAGES: Array<{
  key: string;
  status: string;
  glyph: string;
  color: string;
  short: string;
}> = [
  { key: "nigredo",    status: "DRAFT",      glyph: "⬛", color: "#0a0a0a", short: "Nigredo" },
  { key: "albedo",     status: "GENERATING", glyph: "⬜", color: "#f4f4f4", short: "Albedo" },
  { key: "citrinitas", status: "REVIEW",     glyph: "🟨", color: "#facc15", short: "Citrinitas" },
  { key: "rubedo",     status: "APPROVED",   glyph: "🟥", color: "#dc2626", short: "Rubedo" },
  { key: "lapis",      status: "PUBLISHED",  glyph: "⚪", color: "#fde047", short: "Lapis" },
  { key: "solutio",    status: "FAILED",     glyph: "⚫", color: "#52525b", short: "Solutio" },
];

export function MagnumOpusPanel({ sunoIssues }: MagnumOpusPanelProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {
      DRAFT: 0, GENERATING: 0, REVIEW: 0, APPROVED: 0, PUBLISHED: 0, FAILED: 0,
    };
    for (const i of sunoIssues ?? []) {
      if (i.status in map) map[i.status]++;
    }
    return map;
  }, [sunoIssues]);

  const total = sunoIssues?.length ?? 0;
  const inFlight = counts.DRAFT + counts.GENERATING + counts.REVIEW + counts.APPROVED;

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel g">
          <CaduceusMark /> The Magnum Opus
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          <span className="text-[#ededed] font-medium">{inFlight}</span> in flight
        </span>
      </div>
      <div className="space-y-1.5">
        {OPUS_STAGES.map((stage) => {
          const count = counts[stage.status] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={stage.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-20 font-mono uppercase tracking-wider text-muted-foreground/80 shrink-0">
                {stage.short}
              </span>
              <div className="flex-1 h-1 rounded-full bg-muted/20 overflow-hidden min-w-0">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                    background: stage.color,
                    opacity: count > 0 ? 0.85 : 0.15,
                    boxShadow: count > 0 ? `0 0 6px ${stage.color}` : "none",
                  }}
                />
              </div>
              <span
                className="font-mono tabular-nums w-7 text-right shrink-0"
                style={{ color: count > 0 ? "#ededed" : "#525252" }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 2. Solve et Coagula ──────────────────────────────────────────────────
// Counts dissolution→coagulation cycles. Each suno_issue.rejected followed
// (later) by suno_issue.review_requested counts as one rework cycle. A
// suno_issue.approved completes the loop.

interface SolveEtCoagulaPanelProps {
  activity?: ActivityLike[] | null;
}

export function SolveEtCoagulaPanel({ activity }: SolveEtCoagulaPanelProps) {
  const stats = useMemo(() => {
    const events = activity ?? [];
    let rejected = 0;
    let reworkedThenApproved = 0;
    const reworkPerIssue = new Map<string, number>();
    const approved = new Set<string>();

    // Walk chronologically (assume the api returns desc — reverse it to walk forward)
    const chrono = [...events].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    for (const e of chrono) {
      if (e.entityType !== "suno_issue" || !e.entityId) continue;
      if (e.action === "suno_issue.rejected") {
        rejected++;
        reworkPerIssue.set(
          e.entityId,
          (reworkPerIssue.get(e.entityId) ?? 0) + 1,
        );
      } else if (e.action === "suno_issue.approved") {
        approved.add(e.entityId);
        if ((reworkPerIssue.get(e.entityId) ?? 0) > 0) {
          reworkedThenApproved++;
        }
      }
    }

    const longestStreak = Math.max(0, ...Array.from(reworkPerIssue.values()));

    return { rejected, reworkedThenApproved, longestStreak, approved: approved.size };
  }, [activity]);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel r">
          <CaduceusMark /> Solve et Coagula
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          dissolve · reform
        </span>
      </div>
      <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none glow-r">
        {stats.reworkedThenApproved}
        <span className="font-mono text-[11px] text-[#6e6e6e] ml-2 tracking-[0.08em] uppercase font-medium">
          cycles complete
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Rejected</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.rejected}</div>
        </div>
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Longest streak</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.longestStreak}×</div>
        </div>
      </div>
      <p className="font-mono text-[10px] text-[#525252] mt-3 italic">
        rejected → reworked → approved
      </p>
    </div>
  );
}

// ── 3. The Eighth Sphere ──────────────────────────────────────────────────
// Songs that broke through Fate — i.e., shipped. Right now "shipped" means
// PUBLISHED status. Later we can refine to actual external destinations.

interface EighthSpherePanelProps {
  sunoIssues?: SunoIssueLike[] | null;
}

export function EighthSpherePanel({ sunoIssues }: EighthSpherePanelProps) {
  const stats = useMemo(() => {
    const items = sunoIssues ?? [];
    const published = items.filter((i) => i.status === "PUBLISHED");
    const lastShip = published
      .map((i) => new Date(i.updatedAt).getTime())
      .sort((a, b) => b - a)[0];
    return {
      count: published.length,
      lastShipMs: lastShip ?? 0,
    };
  }, [sunoIssues]);

  const lastShipText = stats.lastShipMs
    ? new Date(stats.lastShipMs).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "never";

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel w">
          <CaduceusMark /> The Eighth Sphere
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          shipped
        </span>
      </div>
      <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none glow-w">
        {stats.count}
        <span className="font-mono text-[11px] text-[#6e6e6e] ml-2 tracking-[0.08em] uppercase font-medium">
          beyond fate
        </span>
      </div>
      <div className="mt-3 font-mono text-[10px] text-[#525252] uppercase tracking-wider">
        last ship · {lastShipText}
      </div>
      <p
        className="font-mono text-[10px] text-[#525252] mt-1 italic"
        title="One is all — Hermetic axiom from the 8th tractate"
      >
        ἕν τὸ πᾶν
      </p>
    </div>
  );
}

// ── 4. Hermes' Errands ────────────────────────────────────────────────────
// Tool-call ledger. Counts agent.* and tool-related activity events today.

interface HermesErrandsPanelProps {
  activity?: ActivityLike[] | null;
}

export function HermesErrandsPanel({ activity }: HermesErrandsPanelProps) {
  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();

    const events = activity ?? [];
    let today = 0;
    let toolish = 0;
    let suno = 0;

    for (const e of events) {
      const t = new Date(e.createdAt).getTime();
      if (t < startMs) continue;
      today++;
      if (
        e.action.includes(".tool.") ||
        e.action.startsWith("agent.") ||
        e.action.includes("dispatched") ||
        e.action.includes("invoked")
      ) {
        toolish++;
      }
      if (e.action.startsWith("suno_issue.")) suno++;
    }

    return { today, toolish, suno };
  }, [activity]);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel b">
          <CaduceusMark /> Hermes' Errands
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          today
        </span>
      </div>
      <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none glow-b">
        {stats.today}
        <span className="font-mono text-[11px] text-[#6e6e6e] ml-2 tracking-[0.08em] uppercase font-medium">
          messages
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Tool/agent</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.toolish}</div>
        </div>
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Suno work</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.suno}</div>
        </div>
      </div>
      <p className="font-mono text-[10px] text-[#525252] mt-3 italic">
        boundaries crossed · Iliad 24.339
      </p>
    </div>
  );
}

// ── 5. The Ouroboros ──────────────────────────────────────────────────────
// Retry loops + self-healing events. Counts heartbeat runs that completed
// after a failure (the loop closing on itself).

interface OuroborosPanelProps {
  runs?: RunLike[] | null;
  activity?: ActivityLike[] | null;
}

export function OuroborosPanel({ runs, activity }: OuroborosPanelProps) {
  const stats = useMemo(() => {
    const r = runs ?? [];
    const a = activity ?? [];
    const failed = r.filter((x) => x.status === "failed" || x.status === "error").length;
    const recovered = r.filter((x) => x.status === "completed" || x.status === "success").length;
    const retries = a.filter(
      (e) =>
        e.action.includes("retry") ||
        e.action.includes("recover") ||
        e.action === "heartbeat.invoked",
    ).length;
    return { failed, recovered, retries };
  }, [runs, activity]);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel p">
          <CaduceusMark /> The Ouroboros
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          self-healing
        </span>
      </div>
      <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none glow-p">
        {stats.retries}
        <span className="font-mono text-[11px] text-[#6e6e6e] ml-2 tracking-[0.08em] uppercase font-medium">
          loops
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Failed</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.failed}</div>
        </div>
        <div>
          <div className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Recovered</div>
          <div className="text-[#ededed] tabular-nums text-base">{stats.recovered}</div>
        </div>
      </div>
      <p
        className="font-mono text-[10px] text-[#525252] mt-3 italic"
        title="One is all — the snake biting its tail"
      >
        ἕν τὸ πᾶν
      </p>
    </div>
  );
}

// ── Composite row ─────────────────────────────────────────────────────────
// Convenience wrapper that lays the five panels out in one responsive grid.
// Drop into the Dashboard between the Hermetica row and Recent Tasks.

interface HermeticPanelsRowProps {
  sunoIssues?: SunoIssueLike[] | null;
  activity?: ActivityLike[] | null;
  runs?: RunLike[] | null;
  className?: string;
}

export function HermeticPanelsRow({
  sunoIssues,
  activity,
  runs,
  className,
}: HermeticPanelsRowProps) {
  return (
    <div className={cn("grid md:grid-cols-2 lg:grid-cols-5 gap-[14px]", className)}>
      <MagnumOpusPanel sunoIssues={sunoIssues} />
      <SolveEtCoagulaPanel activity={activity} />
      <EighthSpherePanel sunoIssues={sunoIssues} />
      <HermesErrandsPanel activity={activity} />
      <OuroborosPanel runs={runs} activity={activity} />
    </div>
  );
}
