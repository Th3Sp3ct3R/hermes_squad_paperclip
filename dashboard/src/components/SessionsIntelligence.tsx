"use client";
import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ── design tokens ─────────────────────────────────────────────────────────────
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
  label: "#a1a1a1",
  orange: "#f97316",
};

// ── types ─────────────────────────────────────────────────────────────────────
type SessionKind = "chat" | "skill" | "local" | "tool" | string;

interface Session {
  id: string;
  title: string;
  model: string;
  msgCount?: number;
  toolCount?: number;
  tokens?: number;
  hot?: boolean;
  highToken?: boolean;
  kind?: SessionKind;
  ts?: string | number;
}

interface SessionsResponse {
  sessions: Session[];
  total?: number;
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
        color: C.label,
        fontWeight: 500,
      }}>
        {title}
      </span>
      {meta && (
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 9,
          color: C.muted,
          marginLeft: "auto",
          letterSpacing: "0.08em",
        }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// ── model pill ────────────────────────────────────────────────────────────────
const MODEL_COLORS: Record<string, string> = {
  claude: "#c084fc",
  gpt: "#10b981",
  gemini: "#3b82f6",
  mistral: "#f97316",
  llama: "#c9a449",
  minimax: "#ef4444",
};

function modelColor(model: string): string {
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return C.muted;
}

function shortModelName(model: string): string {
  const parts = model.split("/");
  const name = parts[parts.length - 1] ?? model;
  return name.length > 22 ? name.slice(0, 20) + "…" : name;
}

// ── kind pill ─────────────────────────────────────────────────────────────────
function kindStyle(kind: SessionKind): { color: string; bg: string; border: string } {
  switch (kind) {
    case "chat":  return { color: C.blue,   bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.25)" };
    case "skill": return { color: C.purple, bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.25)" };
    case "local": return { color: C.gold,   bg: "rgba(201,164,73,0.1)",  border: "rgba(201,164,73,0.25)" };
    case "tool":  return { color: C.orange, bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)" };
    default:      return { color: C.muted,  bg: "rgba(110,110,110,0.1)", border: "rgba(110,110,110,0.2)" };
  }
}

// ── relative time ─────────────────────────────────────────────────────────────
function relativeTime(ts: string | number | undefined): string {
  if (!ts) return "";
  const date = new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// ── token formatter ───────────────────────────────────────────────────────────
function fmtTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ── session row ───────────────────────────────────────────────────────────────
function SessionRow({ session }: { session: Session }) {
  const mc = modelColor(session.model);
  const kind = session.kind ?? "chat";
  const ks = kindStyle(kind);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${C.border}`,
    }}>
      {/* hot indicator */}
      <div style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: session.hot ? C.red : "transparent",
        border: session.hot ? "none" : `1px solid rgba(255,255,255,0.1)`,
        flexShrink: 0,
      }} />

      {/* title */}
      <div style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontFamily: "'Geist', system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 500,
        color: "#e5e5e5",
      }}>
        {session.title}
      </div>

      {/* model tag */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 10,
        color: mc,
        background: `${mc}15`,
        border: `1px solid ${mc}30`,
        borderRadius: 4,
        padding: "2px 6px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}>
        {shortModelName(session.model)}
      </span>

      {/* kind tag */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 9,
        letterSpacing: "0.08em",
        color: ks.color,
        background: ks.bg,
        border: `1px solid ${ks.border}`,
        borderRadius: 3,
        padding: "2px 5px",
        textTransform: "uppercase",
        flexShrink: 0,
      }}>
        {kind}
      </span>

      {/* tokens */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 9,
        color: C.muted,
        flexShrink: 0,
        minWidth: 36,
        textAlign: "right",
      }}>
        {fmtTokens(session.tokens)}
      </span>

      {/* time */}
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 9,
        color: C.muted,
        flexShrink: 0,
        minWidth: 48,
        textAlign: "right",
      }}>
        {relativeTime(session.ts)}
      </span>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function SessionsIntelligence() {
  const { data, error, isLoading } = useSWR<SessionsResponse>("/api/sessions", fetcher, {
    refreshInterval: 5000,
  });

  const sessions = data?.sessions ?? [];
  const hotCount = sessions.filter((s) => s.hot).length;
  const metaStr = hotCount > 0 ? `${sessions.length} TOTAL · ${hotCount} HOT` : `${sessions.length} TOTAL`;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      <SectionHeader title="THE HERMETICA" meta={metaStr} />

      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              height: 42,
              borderBottom: `1px solid ${C.border}`,
              opacity: 0.3,
              background: "rgba(255,255,255,0.01)",
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
          Failed to load sessions
        </div>
      )}

      {!isLoading && !error && (
        <div style={{
          maxHeight: 420,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255,255,255,0.1) transparent",
        }}>
          {sessions.length === 0 && (
            <div style={{
              color: C.muted,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              padding: "24px 0",
              textAlign: "center",
            }}>
              No sessions found
            </div>
          )}
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
