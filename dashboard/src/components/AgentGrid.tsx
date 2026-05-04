"use client";
import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#000",
  card: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  blue: "#3b82f6",
  purple: "#c084fc",
  red: "#ef4444",
  green: "#10b981",
  gold: "#c9a449",
  muted: "#6e6e6e",
  dim: "#3a3a3a",
  orange: "#f97316",
};

// ── geometric SVG icons ───────────────────────────────────────────────────────
function HexagonIcon({ color }: { color: string }) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${14 + 12 * Math.cos(a)},${14 + 12 * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polygon points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function StarIcon({ color }: { color: string }) {
  const outer = 12, inner = 5, cx = 14, cy = 14;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polygon points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function DiamondIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polygon points="14,2 26,14 14,26 2,14" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function ScrollIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <rect x="4" y="7" width="20" height="14" rx="2" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="8" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1" />
      <line x1="8" y1="16" x2="16" y2="16" stroke={color} strokeWidth="1" />
    </svg>
  );
}
function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <path d="M14 3 L24 7 L24 15 C24 21 14 26 14 26 C14 26 4 21 4 15 L4 7 Z" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function PentagonIcon({ color }: { color: string }) {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = (2 * Math.PI * i) / 5 - Math.PI / 2;
    return `${14 + 12 * Math.cos(a)},${14 + 12 * Math.sin(a)}`;
  }).join(" ");
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polygon points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function CrownIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polyline points="3,20 3,10 9,16 14,6 19,16 25,10 25,20" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="3" y1="22" x2="25" y2="22" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function CubeIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <polygon points="14,3 25,9 25,20 14,26 3,20 3,9" fill="none" stroke={color} strokeWidth="1.5" />
      <polygon points="14,3 14,14 25,9" fill="none" stroke={color} strokeWidth="1" opacity="0.6" />
      <polygon points="14,14 25,20 25,9" fill="none" stroke={color} strokeWidth="1" opacity="0.6" />
    </svg>
  );
}
function CrossIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <line x1="14" y1="3" x2="14" y2="25" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="14" x2="25" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function EyeIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <path d="M3 14 C8 7 20 7 25 14 C20 21 8 21 3 14 Z" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="14" cy="14" r="3.5" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}
function HourglassIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <path d="M6 4 L22 4 L14 14 L22 24 L6 24 L14 14 Z" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function SunriseIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <path d="M4 19 Q14 8 24 19" fill="none" stroke={color} strokeWidth="1.5" />
      <circle cx="14" cy="19" r="4" fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="14" y1="5" x2="14" y2="8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="8" x2="8" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="8" x2="20" y2="10" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── icon registry by agent role keyword ─────────────────────────────────────
function AgentIcon({ agentKey, color }: { agentKey: string; color: string }) {
  const k = agentKey.toLowerCase();
  if (k.includes("audio") || k.includes("sound") || k.includes("engineer")) return <HexagonIcon color={color} />;
  if (k.includes("commander") || k.includes("michael") || k.includes("orchestrat")) return <StarIcon color={color} />;
  if (k.includes("visual") || k.includes("jophiel") || k.includes("art")) return <DiamondIcon color={color} />;
  if (k.includes("lyric") || k.includes("zadkiel") || k.includes("poet")) return <ScrollIcon color={color} />;
  if (k.includes("review") || k.includes("raphael") || k.includes("gate")) return <ShieldIcon color={color} />;
  if (k.includes("release") || k.includes("gabriel") || k.includes("copy")) return <PentagonIcon color={color} />;
  if (k.includes("publish") || k.includes("sandalphon") || k.includes("distro")) return <CrownIcon color={color} />;
  if (k.includes("meta") || k.includes("scribe") || k.includes("celestial") || k.includes("metatron")) return <CubeIcon color={color} />;
  if (k.includes("orchestrat")) return <CrossIcon color={color} />;
  if (k.includes("archivist") || k.includes("archive")) return <EyeIcon color={color} />;
  if (k.includes("standby") || k.includes("wait")) return <HourglassIcon color={color} />;
  if (k.includes("env") || k.includes("uriel") || k.includes("prompt")) return <SunriseIcon color={color} />;
  if (k.includes("raziel") || k.includes("browser") || k.includes("auto")) return <CrossIcon color={color} />;
  return <HexagonIcon color={color} />;
}

// ── status pill config ────────────────────────────────────────────────────────
type AgentStatus = "working" | "idle" | "error" | "complete" | "listening" | "reviewing" | "standby" | "drafting" | string;

function statusStyle(status: AgentStatus): { color: string; bg: string; border: string; label: string } {
  switch (status) {
    case "working":    return { color: C.blue,   bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.35)",  label: "WORKING" };
    case "idle":       return { color: C.muted,  bg: "rgba(110,110,110,0.1)",  border: "rgba(110,110,110,0.25)", label: "IDLE" };
    case "error":      return { color: C.red,    bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.35)",   label: "ERROR" };
    case "complete":   return { color: C.green,  bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.35)",  label: "COMPLETE" };
    case "listening":  return { color: C.purple, bg: "rgba(192,132,252,0.12)", border: "rgba(192,132,252,0.35)", label: "LISTENING" };
    case "reviewing":  return { color: C.gold,   bg: "rgba(201,164,73,0.12)",  border: "rgba(201,164,73,0.35)",  label: "REVIEWING" };
    case "standby":    return { color: C.dim,    bg: "rgba(58,58,58,0.2)",     border: "rgba(58,58,58,0.4)",     label: "STANDBY" };
    case "drafting":   return { color: C.orange, bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.35)",  label: "DRAFTING" };
    default:           return { color: C.muted,  bg: "rgba(110,110,110,0.1)",  border: "rgba(110,110,110,0.25)", label: status?.toUpperCase() ?? "UNKNOWN" };
  }
}

// ── agent color by status ─────────────────────────────────────────────────────
function agentIconColor(status: AgentStatus): string {
  const s = statusStyle(status);
  return s.color;
}

// ── types ────────────────────────────────────────────────────────────────────
interface Agent {
  key: string;
  name: string;
  role: string;
  status: AgentStatus;
  progress?: number;
  queue?: number;
  lastEventAt?: string | null;
  hasShipped?: boolean;
}

interface AgentsResponse {
  agents: Agent[];
  meta?: {
    working?: number;
    idle?: number;
    total?: number;
  };
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 3, height: 16, background: C.blue, borderRadius: 2, flexShrink: 0 }} />
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        fontVariant: "small-caps",
        color: "#a1a1a1",
        fontWeight: 500,
      }}>
        {title}
      </span>
      {meta && (
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 9,
          letterSpacing: "0.1em",
          color: C.muted,
          marginLeft: "auto",
        }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// ── agent card ────────────────────────────────────────────────────────────────
function AgentCard({ agent }: { agent: Agent }) {
  const ss = statusStyle(agent.status);
  const iconColor = agentIconColor(agent.status);
  const progress = agent.progress ?? 0;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "12px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      transition: "border-color 0.2s",
    }}>
      {/* icon + status pill row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <AgentIcon agentKey={`${agent.key} ${agent.role}`} color={iconColor} />
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 9,
          padding: "2px 6px",
          borderRadius: 4,
          border: `1px solid ${ss.border}`,
          background: ss.bg,
          color: ss.color,
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
        }}>
          {ss.label}
        </span>
      </div>

      {/* name + role */}
      <div>
        <div style={{
          fontFamily: "'Geist', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 500,
          color: "#e5e5e5",
          lineHeight: 1.3,
        }}>
          {agent.name}
        </div>
        <div style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 8,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.muted,
          marginTop: 2,
          lineHeight: 1.3,
        }}>
          {agent.role}
        </div>
      </div>

      {/* progress bar */}
      {progress > 0 && (
        <div style={{
          height: 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 2,
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, progress)}%`,
            background: ss.color,
            borderRadius: 2,
            transition: "width 0.4s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function AgentGrid() {
  const { data, error, isLoading } = useSWR<AgentsResponse>("/api/agents", fetcher, {
    refreshInterval: 5000,
  });

  const agents = data?.agents ?? [];
  const working = agents.filter((a) => a.status === "working").length;
  const idle = agents.filter((a) => a.status === "idle").length;
  const metaStr = `${working} WORKING · ${idle} IDLE · ${agents.length} TOTAL`;

  return (
    <div style={{ background: C.bg, padding: "20px 24px" }}>
      <SectionHeader title="AGENT ACTIVITY · LIVE" meta={metaStr} />

      {isLoading && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              height: 100,
              opacity: 0.5,
            }} />
          ))}
        </div>
      )}

      {error && (
        <div style={{
          color: C.red,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
          padding: "12px 0",
        }}>
          Failed to load agents
        </div>
      )}

      {!isLoading && !error && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}>
          {agents.map((agent) => (
            <AgentCard key={agent.key} agent={agent} />
          ))}
          {agents.length === 0 && (
            <div style={{
              gridColumn: "1 / -1",
              color: C.muted,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              padding: "24px 0",
              textAlign: "center",
            }}>
              No agents registered
            </div>
          )}
        </div>
      )}
    </div>
  );
}
