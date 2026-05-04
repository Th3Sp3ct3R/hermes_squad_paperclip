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
};

// ── types ─────────────────────────────────────────────────────────────────────
type SkillStatus = "ACTIVE" | "IDLE" | "DONE" | "ERR" | string;

interface Skill {
  key: string;
  name: string;
  status: SkillStatus;
  lastRunAt?: string | number | null;
}

interface SkillsResponse {
  skills: Skill[];
  total?: number;
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 3, height: 16, background: C.purple, borderRadius: 2, flexShrink: 0 }} />
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

// ── status badge config ───────────────────────────────────────────────────────
function statusConfig(status: SkillStatus): { color: string; bg: string; border: string; label: string } {
  switch (status?.toUpperCase()) {
    case "ACTIVE": return { color: C.green, bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)",  label: "ACTIVE" };
    case "IDLE":   return { color: C.muted, bg: "rgba(110,110,110,0.1)", border: "rgba(110,110,110,0.2)", label: "IDLE" };
    case "DONE":   return { color: C.gold,  bg: "rgba(201,164,73,0.12)", border: "rgba(201,164,73,0.3)",  label: "DONE" };
    case "ERR":
    case "ERROR":  return { color: C.red,   bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",   label: "ERR" };
    default:       return { color: C.muted, bg: "rgba(110,110,110,0.1)", border: "rgba(110,110,110,0.2)", label: status ?? "?" };
  }
}

// ── relative time ─────────────────────────────────────────────────────────────
function relativeTime(ts: string | number | null | undefined): string {
  if (!ts) return "never";
  const date = new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ── skill pill ────────────────────────────────────────────────────────────────
function SkillPill({ skill }: { skill: Skill }) {
  const sc = statusConfig(skill.status);

  return (
    <div style={{
      background: "#0d0d0d",
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      transition: "border-color 0.2s",
    }}>
      {/* name + badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontFamily: "'Geist', system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: "#e5e5e5",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          minWidth: 0,
        }}>
          {skill.name}
        </span>
        <span style={{
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 8,
          letterSpacing: "0.1em",
          color: sc.color,
          background: sc.bg,
          border: `1px solid ${sc.border}`,
          borderRadius: 3,
          padding: "2px 5px",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {sc.label}
        </span>
      </div>

      {/* last run */}
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 9,
        color: C.muted,
        letterSpacing: "0.05em",
      }}>
        {relativeTime(skill.lastRunAt)}
      </div>

      {/* subtle key */}
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 8,
        color: "rgba(110,110,110,0.5)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {skill.key}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function SkillInventory() {
  const { data, error, isLoading } = useSWR<SkillsResponse>("/api/skills", fetcher, {
    refreshInterval: 5000,
  });

  const skills = data?.skills ?? [];
  const active = skills.filter((s) => s.status?.toUpperCase() === "ACTIVE").length;
  const metaStr = `${skills.length} SKILLS · ${active} ACTIVE`;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      <SectionHeader title="SKILL INVENTORY" meta={metaStr} />

      {isLoading && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{
              height: 80,
              background: "rgba(255,255,255,0.02)",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              opacity: 0.4,
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
          Failed to load skills
        </div>
      )}

      {!isLoading && !error && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}>
          {skills.length === 0 && (
            <div style={{
              gridColumn: "1 / -1",
              color: C.muted,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              padding: "24px 0",
              textAlign: "center",
            }}>
              No skills registered
            </div>
          )}
          {skills.map((skill) => (
            <SkillPill key={skill.key} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}
