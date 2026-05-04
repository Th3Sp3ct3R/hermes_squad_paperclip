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
interface ModelRow {
  model: string;
  sessions: number;
  tokens: number;
  pctOfCalls: number;
  isActive: boolean;
  ctxK?: number;
}

interface UsageResponse {
  totals: Record<string, number>;
  byDay: unknown[];
  models: ModelRow[];
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
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
    </div>
  );
}

// ── model name shortener ──────────────────────────────────────────────────────
function shortModel(name: string): string {
  // e.g. "anthropic/claude-opus-4" -> "claude-opus-4"
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

// ── bar color by rank ─────────────────────────────────────────────────────────
function barColor(rank: number): string {
  if (rank === 0) return C.purple;
  if (rank === 1) return C.blue;
  return "rgba(255,255,255,0.18)";
}

// ── main component ─────────────────────────────────────────────────────────────
export default function TopModels() {
  const { data, error, isLoading } = useSWR<UsageResponse>("/api/usage", fetcher, {
    refreshInterval: 5000,
  });

  const models = (data?.models ?? [])
    .slice()
    .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0));

  const maxCalls = models[0]?.sessions ?? 1;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      <SectionHeader title="TOP MODELS · 30D" />

      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 36,
              background: "rgba(255,255,255,0.03)",
              borderRadius: 4,
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
        }}>
          Failed to load model data
        </div>
      )}

      {!isLoading && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {models.length === 0 && (
            <div style={{
              color: C.muted,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              padding: "16px 0",
              textAlign: "center",
            }}>
              No model data available
            </div>
          )}

          {models.map((m, i) => {
            const pct = Math.round((m.sessions / maxCalls) * 100);
            const color = barColor(i);

            return (
              <div key={m.model}>
                {/* row: name + call count */}
                <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* rank dot */}
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "'Geist', system-ui, sans-serif",
                      fontSize: 13,
                      color: "#e5e5e5",
                      fontWeight: 500,
                    }}>
                      {shortModel(m.model)}
                    </span>
                    {m.isActive && (
                      <span style={{
                        fontFamily: "'Geist Mono', ui-monospace, monospace",
                        fontSize: 8,
                        color: C.green,
                        border: `1px solid rgba(16,185,129,0.3)`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        letterSpacing: "0.08em",
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 11,
                    color: C.muted,
                    tabularNums: "tabular-nums",
                  } as React.CSSProperties}>
                    {m.sessions.toLocaleString()} sessions
                  </span>
                </div>

                {/* progress bar */}
                <div style={{
                  height: 3,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 2,
                    transition: "width 0.5s ease",
                  }} />
                </div>

                {/* ctx + pct meta */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 4,
                }}>
                  {m.ctxK != null && (
                    <span style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 9,
                      color: C.muted,
                      letterSpacing: "0.06em",
                    }}>
                      {m.ctxK}K ctx
                    </span>
                  )}
                  <span style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 9,
                    color: C.muted,
                    letterSpacing: "0.06em",
                    marginLeft: "auto",
                  }}>
                    {m.pctOfCalls != null ? `${(m.pctOfCalls * 100).toFixed(1)}%` : `${pct}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
