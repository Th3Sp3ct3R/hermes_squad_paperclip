/**
 * Hermetic Telemetry — Phase 3 of The Observatory.
 *
 * Two panels that turn agent collaboration into a celestial diagram:
 *
 *   AspectGrid — astrology-style matrix of agent-to-agent relationships
 *                derived from activity log co-occurrence on the same entity.
 *                  ☌ conjunction (collaborated on same song)
 *                  ☍ opposition  (rejection / disagreement)
 *                  △ trine       (smooth handoff)
 *
 *   Kerykeion  — live agent-to-agent message graph rendered as Hermes' staff:
 *                a central rod with two serpents coiling around it. Each
 *                serpent carries a pulse that runs head-to-tail when activity
 *                fires. Bottom of the panel: top 3 agent pairs by message
 *                volume today.
 */
import { useMemo, useEffect, useState } from "react";
import { CaduceusMark } from "../CaduceusMark";
import { ArchangelAvatar } from "../ArchangelAvatar";
import { type ArchangelName, SPHERE_COLOR_CLASS } from "../SacredGeometry";
import { cn } from "@/lib/utils";

type ActivityLike = {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  agentId?: string | null;
  createdAt: string | Date;
};

const ARCHANGELS: ArchangelName[] = [
  "Michael",
  "Raphael",
  "Gabriel",
  "Metatron",
  "Uriel",
  "Jophiel",
  "Zadkiel",
  "Raziel",
  "Sandalphon",
  "Cassiel",
];

/**
 * Derive the responsible archangel from an activity action when the event
 * doesn't have an explicit agentId set. The activity log records most events
 * with actorType="user" because operations come through HTTP routes without
 * a specific archangel context — but the action *names* tell us who would
 * have done the work in the celestial division of labor.
 *
 * Returns null when the action isn't archangel-attributable (system events).
 */
function deriveResponsibleAgent(action: string): ArchangelName | null {
  // Music-pipeline stages map cleanly to specific archangels
  if (action.includes("lyrics")) return "Zadkiel";
  if (action.includes("soundPrompt") || action.includes("sound_prompt")) return "Uriel";
  if (action.includes("visualPrompt") || action.includes("visual_prompt") || action.includes("cover_art") || action.includes("coverArt")) return "Jophiel";
  if (action.includes("releaseCopy") || action.includes("release_copy")) return "Gabriel";
  if (action.includes("minimax") || action.includes("audioUrl") || action.includes("song_via")) return "Raziel";
  if (action.includes("publish")) return "Sandalphon";
  // State-machine moves
  if (action.includes("approve") || action.includes("review_request") || action.includes("reject") || action.includes("canon")) return "Raphael";
  if (action.includes("dispatch") || action.includes("assign") || action.includes("auto_run")) return "Michael";
  if (action.includes("triage") || action.includes("failed_stale") || action.includes("expired")) return "Cassiel";
  if (action.includes("linked_to_issue") || action.includes("backfilled")) return "Metatron";
  if (action.includes("created") && action.includes("suno")) return "Michael";
  return null;
}

/** Resolve an event's agent: explicit agentId first, otherwise derive from action. */
function resolveAgent(
  e: ActivityLike,
  agentNameById: Map<string, string>,
): ArchangelName | null {
  // 1) Explicit agentId — take it if it maps to a known archangel name.
  if (e.agentId) {
    const name = agentNameById.get(e.agentId);
    if (name && ARCHANGELS.includes(name as ArchangelName)) {
      return name as ArchangelName;
    }
  }
  // 2) Fallback: derive from action.
  return deriveResponsibleAgent(e.action);
}

// ── 1. The Aspect Grid ────────────────────────────────────────────────────
// Build a co-occurrence matrix from the activity log. Two agents are
// "in conjunction" if they both touched the same entity in the recent past.
// Plus we surface the strongest current axis.

interface AspectGridPanelProps {
  /** Activity log events. We need agentId + entityType + entityId + action. */
  activity?: ActivityLike[] | null;
  /** Map agentId → agent name so we can join. */
  agentIdToName?: Map<string, string> | null;
}

interface PairStat {
  conjunction: number; // shared entities
  opposition: number;  // rejection events involving both
  trine: number;       // handoffs (approve/review followed by deposit/dispatch)
}

function emptyStat(): PairStat {
  return { conjunction: 0, opposition: 0, trine: 0 };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function AspectGridPanel({
  activity,
  agentIdToName,
}: AspectGridPanelProps) {
  const stats = useMemo(() => {
    const events = activity ?? [];
    const map = agentIdToName ?? new Map();

    // Annotate each event with its resolved (or derived) archangel name.
    type Annotated = ActivityLike & { agentName: ArchangelName | null };
    const annotated: Annotated[] = events.map((e) => ({
      ...e,
      agentName: resolveAgent(e, map),
    }));

    // Group annotated events by entity.
    const byEntity = new Map<string, Annotated[]>();
    for (const e of annotated) {
      if (!e.entityId || !e.agentName) continue;
      const k = `${e.entityType ?? ""}:${e.entityId}`;
      const arr = byEntity.get(k) ?? [];
      arr.push(e);
      byEntity.set(k, arr);
    }

    // Every distinct pair of agents that touched the same entity = conjunction.
    const pairs = new Map<string, PairStat>();
    for (const [, evts] of byEntity) {
      const seen = new Set<ArchangelName>();
      for (const e of evts) seen.add(e.agentName!);
      const names = Array.from(seen);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const k = pairKey(names[i]!, names[j]!);
          const s = pairs.get(k) ?? emptyStat();
          s.conjunction += 1;
          pairs.set(k, s);
        }
      }
      // Opposition: rejection / failure events involving two distinct agents.
      const rejections = evts.filter((e) => e.action.includes("rejected") || e.action.includes("failed"));
      for (const rj of rejections) {
        for (const e of evts) {
          if (e.agentName && rj.agentName && e.agentName !== rj.agentName) {
            const k = pairKey(rj.agentName, e.agentName);
            const s = pairs.get(k) ?? emptyStat();
            s.opposition += 1;
            pairs.set(k, s);
          }
        }
      }
      // Trine: smooth handoffs (approve / publish / request-review).
      const handoffs = evts.filter((e) => e.action.includes("approved") || e.action.includes("published") || e.action.includes("review_request"));
      for (const h of handoffs) {
        for (const e of evts) {
          if (e.agentName && h.agentName && e.agentName !== h.agentName) {
            const k = pairKey(h.agentName, e.agentName);
            const s = pairs.get(k) ?? emptyStat();
            s.trine += 1;
            pairs.set(k, s);
          }
        }
      }
    }

    // Convert pairs map → sorted list. Names are already archangel-validated.
    const list: Array<{ aName: ArchangelName; bName: ArchangelName; stat: PairStat }> = [];
    for (const [key, stat] of pairs) {
      const [a, b] = key.split("|");
      if (a && b) {
        list.push({
          aName: a as ArchangelName,
          bName: b as ArchangelName,
          stat,
        });
      }
    }
    list.sort(
      (x, y) =>
        (y.stat.conjunction + y.stat.opposition + y.stat.trine) -
        (x.stat.conjunction + x.stat.opposition + x.stat.trine),
    );
    return list;
  }, [activity, agentIdToName]);

  const top = stats.slice(0, 6);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="seclabel p"
          title="Astrology applied to agent telemetry. Aspects derived from activity log co-occurrence on the same entity: ☌ conjunction (collaborated on the same song), ☍ opposition (rejection / disagreement), △ trine (smooth handoff)."
        >
          <CaduceusMark /> The Aspect Grid
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          {stats.length} aspects
        </span>
      </div>

      {top.length === 0 && (
        <div className="py-8 text-center font-mono text-[11px] uppercase tracking-wider text-[#525252]">
          no aspects yet · agents at rest
        </div>
      )}

      <div className="space-y-2">
        {top.map((p) => {
          const total = p.stat.conjunction + p.stat.opposition + p.stat.trine;
          // Dominant aspect symbol — highest of the three
          const max = Math.max(p.stat.conjunction, p.stat.opposition, p.stat.trine);
          const symbol =
            max === p.stat.opposition && p.stat.opposition > 0
              ? "☍"
              : max === p.stat.trine && p.stat.trine > 0
                ? "△"
                : "☌";
          const tone =
            symbol === "☍"
              ? "#ef4444"
              : symbol === "△"
                ? "#10b981"
                : "#a78bfa";
          return (
            <div
              key={`${p.aName}-${p.bName}`}
              className="flex items-center gap-2.5 text-[11px] font-mono"
            >
              <ArchangelAvatar name={p.aName} size="xs" />
              <span
                className="text-[14px] leading-none"
                style={{
                  color: tone,
                  textShadow: `0 0 6px ${tone}88`,
                }}
                title={
                  symbol === "☌"
                    ? "Conjunction — collaboration"
                    : symbol === "☍"
                      ? "Opposition — rejection / disagreement"
                      : "Trine — smooth handoff"
                }
              >
                {symbol}
              </span>
              <ArchangelAvatar name={p.bName} size="xs" />
              <span className="ml-auto tabular-nums text-[#ededed]">{total}</span>
              <span className="text-[#525252] uppercase tracking-wider text-[10px] w-20 text-right">
                {p.stat.conjunction}c · {p.stat.opposition}o · {p.stat.trine}t
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-[10px] font-mono uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#a78bfa", textShadow: "0 0 4px #a78bfa66" }}>☌</span>
          <span className="text-[#6e6e6e]">conjunction</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#ef4444", textShadow: "0 0 4px #ef444466" }}>☍</span>
          <span className="text-[#6e6e6e]">opposition</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#10b981", textShadow: "0 0 4px #10b98166" }}>△</span>
          <span className="text-[#6e6e6e]">trine</span>
        </div>
      </div>
    </div>
  );
}

// ── 2. The Kerykeion ──────────────────────────────────────────────────────
// Live agent-to-agent message graph as Hermes' staff. Central rod, two
// serpents coiling around it, each carrying a moving pulse dot when there's
// activity. Below: top 3 agent pairs by today's message volume.

interface KerykeionPanelProps {
  activity?: ActivityLike[] | null;
  agentIdToName?: Map<string, string> | null;
}

export function KerykeionPanel({ activity, agentIdToName }: KerykeionPanelProps) {
  const { topPairs, todayCount } = useMemo(() => {
    const events = activity ?? [];
    const map = agentIdToName ?? new Map();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();

    type Annotated = ActivityLike & { agentName: ArchangelName | null };
    const todayEvents: Annotated[] = [];
    for (const e of events) {
      const t = new Date(e.createdAt).getTime();
      if (t < startMs) continue;
      todayEvents.push({ ...e, agentName: resolveAgent(e, map) });
    }
    const count = todayEvents.length;

    const byEntity = new Map<string, Annotated[]>();
    for (const e of todayEvents) {
      if (!e.entityId || !e.agentName) continue;
      const k = `${e.entityType ?? ""}:${e.entityId}`;
      const arr = byEntity.get(k) ?? [];
      arr.push(e);
      byEntity.set(k, arr);
    }

    const pairCounts = new Map<
      string,
      { aName: ArchangelName; bName: ArchangelName; n: number }
    >();
    for (const [, evts] of byEntity) {
      const names = Array.from(new Set(evts.map((e) => e.agentName).filter(Boolean) as ArchangelName[]));
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const k = pairKey(names[i]!, names[j]!);
          const cur = pairCounts.get(k) ?? { aName: names[i]!, bName: names[j]!, n: 0 };
          cur.n += 1;
          pairCounts.set(k, cur);
        }
      }
    }

    const top = Array.from(pairCounts.values())
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);

    return { topPairs: top, todayCount: count };
  }, [activity, agentIdToName]);

  // Pulse trigger — animate when todayCount changes
  const [pulseTick, setPulseTick] = useState(0);
  useEffect(() => {
    setPulseTick((t) => t + 1);
  }, [todayCount]);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3
          className="seclabel g"
          title="Greek for Hermes' staff (Latin: caduceus). Two serpents coiled around a winged rod = inbound and outbound agent-to-agent message flow. Pulse dots travel each serpent when traffic fires."
        >
          <CaduceusMark /> The Kerykeion
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          <span className="text-[#ededed]">{todayCount}</span> today
        </span>
      </div>

      <div className="flex items-center gap-4">
        {/* The staff itself — centered SVG */}
        <div className="shrink-0">
          <KerykeionSVG pulseKey={pulseTick} active={todayCount > 0} />
        </div>

        {/* Top 3 pairs — the "conversations" today */}
        <div className="flex-1 min-w-0 space-y-2">
          {topPairs.length === 0 && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#525252]">
              no traffic today · serpents at rest
            </div>
          )}
          {topPairs.map((p) => (
            <div
              key={`${p.aName}-${p.bName}`}
              className="flex items-center gap-2.5 text-[11px] font-mono"
            >
              <ArchangelAvatar name={p.aName} size="xs" />
              <span
                className="text-[#a78bfa]"
                style={{ textShadow: "0 0 4px #a78bfa66" }}
              >
                ↔
              </span>
              <ArchangelAvatar name={p.bName} size="xs" />
              <span className="ml-auto tabular-nums text-[#ededed]">{p.n}</span>
              <span className="text-[#525252] uppercase tracking-wider text-[10px]">
                msgs
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="font-mono text-[10px] text-[#525252] mt-3 italic text-center">
        Hermes' staff · the inter-agent bus
      </p>
    </div>
  );
}

// ── Kerykeion SVG ─────────────────────────────────────────────────────────
// Central staff with two serpents coiling around it. Each serpent has a
// dashed pulse running head-to-tail when active.

function KerykeionSVG({ pulseKey, active }: { pulseKey: number; active: boolean }) {
  return (
    <svg
      viewBox="0 0 60 120"
      width={120}
      height={240}
      className="text-[#fde047]"
    >
      {/* Wings at top */}
      <path
        d="M 30 14 Q 14 10 8 18"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 30 14 Q 46 10 52 18"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 16 12 L 12 16"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M 44 12 L 48 16"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />

      {/* Orb at top */}
      <circle cx="30" cy="10" r="2.6" fill="currentColor" />

      {/* Central staff */}
      <line
        x1="30"
        y1="14"
        x2="30"
        y2="116"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Serpent 1 — left coil. Path goes top-down weaving across the staff. */}
      <path
        id={`kery-snake1-${pulseKey}`}
        d="M 22 22 Q 30 28 38 36 Q 30 44 22 52 Q 30 60 38 68 Q 30 76 22 84 Q 30 92 38 100 Q 30 108 22 114"
        stroke="#10b981"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Serpent 2 — right coil, mirror-phase. */}
      <path
        id={`kery-snake2-${pulseKey}`}
        d="M 38 22 Q 30 28 22 36 Q 30 44 38 52 Q 30 60 22 68 Q 30 76 38 84 Q 30 92 22 100 Q 30 108 38 114"
        stroke="#a78bfa"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Serpent heads */}
      <circle cx="22" cy="115" r="1.6" fill="#10b981" />
      <circle cx="38" cy="115" r="1.6" fill="#a78bfa" />

      {/* Pulse dots travelling each serpent — only when active */}
      {active && (
        <>
          <circle r="1.8" fill="#10b981">
            <animateMotion
              dur="3.2s"
              repeatCount="indefinite"
              path="M 22 22 Q 30 28 38 36 Q 30 44 22 52 Q 30 60 38 68 Q 30 76 22 84 Q 30 92 38 100 Q 30 108 22 114"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="1.8" fill="#a78bfa">
            <animateMotion
              dur="3.2s"
              begin="1.6s"
              repeatCount="indefinite"
              path="M 38 22 Q 30 28 22 36 Q 30 44 38 52 Q 30 60 22 68 Q 30 76 38 84 Q 30 92 22 100 Q 30 108 38 114"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="3.2s"
              begin="1.6s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}
    </svg>
  );
}

// ── Composite row ─────────────────────────────────────────────────────────
// Rendered as one wide row at the bottom of the Observatory. Aspect Grid on
// the left (more compact list), Kerykeion on the right (visual + top pairs).

interface TelemetryRowProps {
  activity?: ActivityLike[] | null;
  agentIdToName?: Map<string, string> | null;
  className?: string;
}

export function TelemetryRow({ activity, agentIdToName, className }: TelemetryRowProps) {
  // Suppress unused import warning when no archangel renders. Keep
  // SPHERE_COLOR_CLASS reference for future palette use.
  void SPHERE_COLOR_CLASS;
  return (
    <div className={cn("grid md:grid-cols-2 gap-[14px]", className)}>
      <AspectGridPanel activity={activity} agentIdToName={agentIdToName} />
      <KerykeionPanel activity={activity} agentIdToName={agentIdToName} />
    </div>
  );
}
