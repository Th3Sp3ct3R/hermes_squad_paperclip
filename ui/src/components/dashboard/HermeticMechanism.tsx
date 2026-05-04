/**
 * Hermetic Mechanism — Phase 2 of The Observatory.
 *
 * Three panels visualizing the celestial mechanism the pipeline runs on:
 *
 *   PlanetaryHour — current ruling planet + archangel of the hour. Heptameron /
 *                   Agrippa Bk II tradition: each hour rotates through the
 *                   Chaldean order (Saturn → Jupiter → Mars → Sun → Venus →
 *                   Mercury → Moon). The day's first hour is the day-planet.
 *                   Used to bias agent dispatch toward the hour's ruler.
 *
 *   Heptachord    — seven-string visualization, one per chakra/planet.
 *                   Strings tuned to the Solfeggio frequencies (396, 417, 528,
 *                   639, 741, 852, 963 Hz). String brightness = number of
 *                   songs shipped in that band.
 *
 *   Monochord     — Fludd's cosmic string with Pythagorean ratio marks at
 *                   the seven planetary proportions. Pulses on each new
 *                   PUBLISHED song (Sandalphon's master output bus).
 */
import { useMemo, useState, useEffect } from "react";
import { CaduceusMark } from "../CaduceusMark";
import { cn } from "@/lib/utils";

// ── Planetary correspondences ────────────────────────────────────────────
// Heptameron / Agrippa standard mapping. We use the archangels that match our
// Tree-of-Life sphere assignments where possible.

const CHALDEAN_ORDER = [
  "Saturn",
  "Jupiter",
  "Mars",
  "Sun",
  "Venus",
  "Mercury",
  "Moon",
] as const;

type Planet = (typeof CHALDEAN_ORDER)[number];

// JS getDay() returns 0=Sunday … 6=Saturday
const DAY_PLANET: Record<number, Planet> = {
  0: "Sun",      // Sunday
  1: "Moon",     // Monday
  2: "Mars",     // Tuesday
  3: "Mercury",  // Wednesday
  4: "Jupiter",  // Thursday
  5: "Venus",    // Friday
  6: "Saturn",   // Saturday
};

const PLANET_GLYPH: Record<Planet, string> = {
  Saturn:  "♄",
  Jupiter: "♃",
  Mars:    "♂",
  Sun:     "☉",
  Venus:   "♀",
  Mercury: "☿",
  Moon:    "☽",
};

// Match to our archangels using Tree-of-Life sphere alignments where they
// correspond. Mercury → Raziel (keeper of mysteries / Hermetic tradition).
const PLANET_ARCHANGEL: Record<Planet, string> = {
  Saturn:  "Cassiel",     // Binah — Saturn
  Jupiter: "Zadkiel",     // Chesed — Jupiter
  Mars:    "Michael",     // Geburah — Mars
  Sun:     "Raphael",     // Tiphareth — Sun
  Venus:   "Uriel",       // Netzach — Venus
  Mercury: "Raziel",      // Hermes / Mercury — keeper of mysteries
  Moon:    "Gabriel",     // Yesod — Moon
};

const PLANET_COLOR: Record<Planet, string> = {
  Saturn:  "#475569",  // slate
  Jupiter: "#2563eb",  // blue
  Mars:    "#dc2626",  // red
  Sun:     "#fde047",  // gold
  Venus:   "#10b981",  // emerald
  Mercury: "#a78bfa",  // violet
  Moon:    "#cbd5e1",  // silver
};

/**
 * Compute the ruling planet for a given hour-of-day on a given day-of-week.
 * Simplified: 24-hour day, hour 0 starts at midnight, hour-0 ruler is the
 * day's planet, subsequent hours cycle the Chaldean order.
 */
function planetaryRuler(date: Date): Planet {
  const dayPlanet = DAY_PLANET[date.getDay()] ?? "Sun";
  const hour = date.getHours();
  const startIdx = CHALDEAN_ORDER.indexOf(dayPlanet);
  const idx = (startIdx + hour) % CHALDEAN_ORDER.length;
  return CHALDEAN_ORDER[idx]!;
}

function nextHourBoundary(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  next.setHours(date.getHours() + 1);
  return next;
}

// ── 1. The Planetary Hour ─────────────────────────────────────────────────

export function PlanetaryHourPanel() {
  const [now, setNow] = useState(() => new Date());

  // Re-render once per minute so the chip stays current and the timer ticks.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const ruler = planetaryRuler(now);
  const archangel = PLANET_ARCHANGEL[ruler];
  const color = PLANET_COLOR[ruler];
  const next = nextHourBoundary(now);
  const nextRuler = planetaryRuler(next);
  const minutesLeft = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60_000));

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel g">
          <CaduceusMark /> The Planetary Hour
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          Heptameron
        </span>
      </div>

      {/* Big glyph + planet name */}
      <div className="flex items-center gap-3 mb-2">
        <span
          className="font-serif leading-none tabular-nums"
          style={{
            fontSize: "44px",
            color,
            textShadow: `0 0 12px ${color}, 0 0 28px ${color}55`,
          }}
        >
          {PLANET_GLYPH[ruler]}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="font-mono uppercase tracking-[0.18em] text-sm"
            style={{ color }}
          >
            {ruler}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6e6e6e] mt-0.5">
            biases dispatch toward
          </div>
          <div className="text-[15px] font-medium tracking-tight mt-0.5">
            {archangel}
          </div>
        </div>
      </div>

      {/* Next-up + countdown */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono">
        <span className="text-[#6e6e6e] uppercase tracking-wider text-[10px]">Next</span>
        <span className="text-[#ededed]">
          <span style={{ color: PLANET_COLOR[nextRuler] }}>{PLANET_GLYPH[nextRuler]}</span>{" "}
          <span className="uppercase tracking-wider">{nextRuler}</span>
          <span className="text-[#525252] ml-2">in {minutesLeft}m</span>
        </span>
      </div>
    </div>
  );
}

// ── 2. The Heptachord ─────────────────────────────────────────────────────

const CHAKRA_FREQ_LIST: Array<{
  chakra: string;
  hz: number;
  color: string;
  label: string;
}> = [
  { chakra: "ROOT",      hz: 396, color: "#dc2626", label: "Root" },
  { chakra: "SACRAL",    hz: 417, color: "#ea580c", label: "Sacral" },
  { chakra: "SOLAR",     hz: 528, color: "#facc15", label: "Solar" },
  { chakra: "HEART",     hz: 639, color: "#10b981", label: "Heart" },
  { chakra: "THROAT",    hz: 741, color: "#0ea5e9", label: "Throat" },
  { chakra: "THIRD_EYE", hz: 852, color: "#6366f1", label: "Third Eye" },
  { chakra: "CROWN",     hz: 963, color: "#a78bfa", label: "Crown" },
];

interface HeptachordPanelProps {
  /** sunoIssues from the Dashboard query — used to compute ships per chakra. */
  sunoIssues?: Array<{ targetChakra: string; status: string }> | null;
}

export function HeptachordPanel({ sunoIssues }: HeptachordPanelProps) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {
      ROOT: 0, SACRAL: 0, SOLAR: 0, HEART: 0, THROAT: 0, THIRD_EYE: 0, CROWN: 0,
    };
    for (const i of sunoIssues ?? []) {
      // Only count ships (PUBLISHED) — the string is "lit" by completed work.
      if (i.status === "PUBLISHED" && i.targetChakra in map) {
        map[i.targetChakra]++;
      }
    }
    return map;
  }, [sunoIssues]);

  const max = Math.max(1, ...Object.values(counts));
  const lit = Object.values(counts).filter((c) => c > 0).length;

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel s">
          <CaduceusMark /> The Heptachord
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          <span className="text-[#ededed]">{lit}</span>/7 strings lit
        </span>
      </div>

      {/* Seven horizontal strings, each one a chakra freq band */}
      <div className="space-y-2">
        {CHAKRA_FREQ_LIST.map((s) => {
          const count = counts[s.chakra] ?? 0;
          const intensity = count / max;
          return (
            <div key={s.chakra} className="flex items-center gap-3">
              <span className="w-20 font-mono text-[10px] uppercase tracking-wider text-[#6e6e6e] shrink-0">
                {s.label}
              </span>
              <span
                className="font-mono text-[10px] tabular-nums w-12 shrink-0"
                style={{ color: count > 0 ? s.color : "#404040" }}
              >
                {s.hz}Hz
              </span>
              {/* The string itself: a thin horizontal line that brightens with ships */}
              <div className="flex-1 h-[2px] relative overflow-visible min-w-0">
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full transition-all"
                  style={{
                    background: s.color,
                    opacity: count > 0 ? 0.4 + intensity * 0.6 : 0.12,
                    boxShadow:
                      count > 0
                        ? `0 0 ${4 + intensity * 8}px ${s.color}, 0 0 ${10 + intensity * 16}px ${s.color}55`
                        : "none",
                  }}
                />
                {/* Plucked-string sine wave when count > 0 */}
                {count > 0 && (
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-3"
                  >
                    <path
                      d="M 0 3 Q 25 1 50 3 T 100 3"
                      stroke={s.color}
                      strokeWidth="0.5"
                      fill="none"
                      opacity={0.6}
                    />
                  </svg>
                )}
              </div>
              <span
                className="font-mono tabular-nums text-[11px] w-7 text-right shrink-0"
                style={{ color: count > 0 ? "#ededed" : "#525252" }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
      <p className="font-mono text-[10px] text-[#525252] mt-3 italic text-center">
        Hymn 4 — septem chordae mundi
      </p>
    </div>
  );
}

// ── 3. The Monochord ──────────────────────────────────────────────────────
// Fludd's Utriusque Cosmi (1617) — single string spanning the cosmic octave,
// marked at the seven planetary proportions. We render it as a vertical
// gradient with the seven proportional marks and a glowing tone bar that
// pulses when a song lands in PUBLISHED state.

interface MonochordPanelProps {
  sunoIssues?: Array<{ status: string; updatedAt: string | Date }> | null;
}

export function MonochordPanel({ sunoIssues }: MonochordPanelProps) {
  // Pulse logic: ring-glow whenever the most recently published song's
  // updatedAt is within the last 60s.
  const lastPublishMs = useMemo(() => {
    let max = 0;
    for (const i of sunoIssues ?? []) {
      if (i.status === "PUBLISHED") {
        const t = new Date(i.updatedAt).getTime();
        if (t > max) max = t;
      }
    }
    return max;
  }, [sunoIssues]);

  const [pulseOn, setPulseOn] = useState(false);
  useEffect(() => {
    if (!lastPublishMs) return;
    const ageMs = Date.now() - lastPublishMs;
    if (ageMs < 60_000) {
      setPulseOn(true);
      const t = window.setTimeout(() => setPulseOn(false), 60_000 - ageMs);
      return () => window.clearTimeout(t);
    }
    setPulseOn(false);
  }, [lastPublishMs]);

  // The seven planetary proportions on Fludd's monochord — Saturn (top of
  // string, longest) down to Moon (bottom, shortest). Positions are the
  // traditional Pythagorean intervals scaled to vertical 0–100%.
  const STOPS: Array<{ planet: Planet; pct: number }> = [
    { planet: "Saturn",  pct: 0    }, // top of string
    { planet: "Jupiter", pct: 14.3 },
    { planet: "Mars",    pct: 28.6 },
    { planet: "Sun",     pct: 50   }, // octave midpoint
    { planet: "Venus",   pct: 64.3 },
    { planet: "Mercury", pct: 78.6 },
    { planet: "Moon",    pct: 100  }, // bottom
  ];

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="seclabel w">
          <CaduceusMark /> The Monochord
        </h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          Sandalphon's bus
        </span>
      </div>

      <div className="flex items-stretch gap-3">
        {/* The vertical string */}
        <div className="relative w-[6px] h-44 shrink-0 self-center">
          <div
            className={cn(
              "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] rounded-full",
              pulseOn && "monochord-pulse",
            )}
            style={{
              background:
                "linear-gradient(180deg, rgba(180,180,180,0.4), #fff 50%, rgba(180,180,180,0.4))",
              boxShadow: pulseOn
                ? "0 0 8px #fff, 0 0 18px rgba(255,255,255,0.6)"
                : "0 0 4px rgba(255,255,255,0.2)",
            }}
          />
          {/* Stop marks — small horizontal ticks at each planet's position */}
          {STOPS.map((s) => (
            <div
              key={s.planet}
              className="absolute -translate-y-1/2"
              style={{
                left: 0,
                right: 0,
                top: `${s.pct}%`,
              }}
            >
              <div
                className="mx-auto w-[14px] h-[1px]"
                style={{
                  background: PLANET_COLOR[s.planet],
                  boxShadow: `0 0 4px ${PLANET_COLOR[s.planet]}`,
                }}
              />
            </div>
          ))}
        </div>

        {/* Labels next to each stop */}
        <div className="relative h-44 flex-1 min-w-0">
          {STOPS.map((s) => (
            <div
              key={s.planet}
              className="absolute -translate-y-1/2 flex items-center gap-2"
              style={{ top: `${s.pct}%`, left: 0 }}
            >
              <span
                className="font-serif text-[14px] leading-none"
                style={{
                  color: PLANET_COLOR[s.planet],
                  textShadow: `0 0 4px ${PLANET_COLOR[s.planet]}55`,
                }}
              >
                {PLANET_GLYPH[s.planet]}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#6e6e6e]">
                {s.planet}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="font-mono text-[10px] text-[#525252] mt-3 italic text-center">
        Fludd · Utriusque Cosmi · 1617
      </p>
    </div>
  );
}

// ── Composite row ─────────────────────────────────────────────────────────

interface MechanismRowProps {
  sunoIssues?: Array<{
    targetChakra: string;
    status: string;
    updatedAt: string | Date;
  }> | null;
  className?: string;
}

export function MechanismRow({ sunoIssues, className }: MechanismRowProps) {
  return (
    <div
      className={cn(
        "grid md:grid-cols-2 lg:grid-cols-4 gap-[14px]",
        className,
      )}
    >
      <PlanetaryHourPanel />
      <div className="lg:col-span-2">
        <HeptachordPanel sunoIssues={sunoIssues ?? null} />
      </div>
      <MonochordPanel sunoIssues={sunoIssues ?? null} />
    </div>
  );
}
