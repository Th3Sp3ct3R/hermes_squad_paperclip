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
interface DayBucket {
  date: string;
  sessions: number;
  tokensIn: number;
  tokensOut: number;
  apiCalls: number;
}

interface UsageResponse {
  totals: {
    sessions: number;
    tokensIn: number;
    tokensOut: number;
    apiCalls: number;
    toolCalls: number;
    cost: number;
    cacheHits: number;
    cacheReads: number;
  };
  byDay: DayBucket[];
  models: Array<{
    model: string;
    sessions: number;
    tokens: number;
    pctOfCalls: number;
    isActive: boolean;
    ctxK?: number;
  }>;
}

// ── sparkline SVG ─────────────────────────────────────────────────────────────
function Sparkline({
  values,
  color,
  width = 120,
  height = 40,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!values.length) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = "M " + pts.join(" L ");
  const fillD = `${pathD} L ${width - pad},${height - pad} L ${pad},${height - pad} Z`;

  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── number formatter ──────────────────────────────────────────────────────────
function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── glow color map ────────────────────────────────────────────────────────────
type CardVariant = "sessions" | "tokens" | "apiCalls" | "model";

function glowColor(variant: CardVariant): string {
  switch (variant) {
    case "sessions": return "rgba(255,255,255,0.04)";
    case "tokens":   return "rgba(192,132,252,0.06)";
    case "apiCalls": return "rgba(239,68,68,0.06)";
    case "model":    return "rgba(16,185,129,0.06)";
  }
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
        color: "#a1a1a1",
        fontWeight: 500,
      }}>
        {title}
      </span>
    </div>
  );
}

// ── individual stat card ──────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string;
  subtitle: string;
  sparkValues?: number[];
  sparkColor?: string;
  variant: CardVariant;
  delay: number;
  modelOnline?: boolean;
  isModel?: boolean;
}

function StatCard({
  label,
  value,
  subtitle,
  sparkValues,
  sparkColor,
  variant,
  delay,
  isModel,
  modelOnline,
}: StatCardProps) {
  return (
    <div
      className="animate-card-rise"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: `inset 0 0 40px 0 ${glowColor(variant)}`,
        animationDelay: `${delay}ms`,
        opacity: 0,
      }}
    >
      {/* label */}
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: C.label,
      }}>
        {label}
      </div>

      {/* big number or model name */}
      {isModel ? (
        <div>
          <div style={{
            fontFamily: "'Geist', system-ui, sans-serif",
            fontSize: 20,
            fontWeight: 600,
            color: "#e5e5e5",
            lineHeight: 1.2,
            wordBreak: "break-all",
          }}>
            {value}
          </div>
          {modelOnline && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 6,
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 4,
              padding: "2px 7px",
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: C.green,
              }} />
              <span style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 9,
                color: C.green,
                letterSpacing: "0.1em",
              }}>
                ONLINE
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          fontFamily: "'Geist', system-ui, sans-serif",
          fontSize: 36,
          fontWeight: 600,
          color: "#ffffff",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}>
          {value}
        </div>
      )}

      {/* sparkline */}
      {sparkValues && sparkColor && (
        <div style={{ marginTop: 4 }}>
          <Sparkline values={sparkValues} color={sparkColor} width={120} height={40} />
        </div>
      )}

      {/* subtitle */}
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        color: "#6e6e6e",
        marginTop: "auto",
      }}>
        {subtitle}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function WorkspacePulse() {
  const { data, error, isLoading } = useSWR<UsageResponse>("/api/usage", fetcher, {
    refreshInterval: 5000,
  });

  const totals = data?.totals;
  const byDay = data?.byDay ?? [];
  const last14 = byDay.slice(-14);
  const activeModel = data?.models?.find((m) => m.isActive) ?? data?.models?.[0];

  const sessionValues = last14.map((d) => d.sessions);
  const tokenValues = last14.map((d) => (d.tokensIn ?? 0) + (d.tokensOut ?? 0));
  const apiCallValues = last14.map((d) => d.apiCalls ?? 0);

  const totalTokens = (totals?.tokensIn ?? 0) + (totals?.tokensOut ?? 0);

  const cards: StatCardProps[] = [
    {
      label: "Sessions",
      value: formatBigNumber(totals?.sessions ?? 0),
      subtitle: `${last14.length}d rolling window`,
      sparkValues: sessionValues,
      sparkColor: C.blue,
      variant: "sessions",
      delay: 0,
    },
    {
      label: "Tokens",
      value: formatBigNumber(totalTokens),
      subtitle: `${formatBigNumber(totals?.tokensIn ?? 0)} in · ${formatBigNumber(totals?.tokensOut ?? 0)} out`,
      sparkValues: tokenValues,
      sparkColor: C.purple,
      variant: "tokens",
      delay: 80,
    },
    {
      label: "API Calls",
      value: formatBigNumber(totals?.apiCalls ?? 0),
      subtitle: `${formatBigNumber(totals?.toolCalls ?? 0)} tool calls`,
      sparkValues: apiCallValues,
      sparkColor: C.red,
      variant: "apiCalls",
      delay: 160,
    },
    {
      label: "Active Model",
      value: activeModel?.model ?? "—",
      subtitle: activeModel ? `${activeModel.ctxK ?? "?"}K context` : "No model active",
      variant: "model",
      delay: 240,
      isModel: true,
      modelOnline: !!activeModel?.isActive,
    },
  ];

  if (isLoading) {
    return (
      <div style={{ background: C.bg, padding: "20px 24px" }}>
        <SectionHeader title="WORKSPACE PULSE" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              height: 160,
              opacity: 0.4,
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: C.bg, padding: "20px 24px" }}>
        <SectionHeader title="WORKSPACE PULSE" />
        <div style={{
          color: C.red,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
        }}>
          Failed to load usage data
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, padding: "20px 24px" }}>
      <SectionHeader title="WORKSPACE PULSE" />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 12,
      }}>
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  );
}
