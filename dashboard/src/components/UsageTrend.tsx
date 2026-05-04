"use client";
import useSWR from "swr";
import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#000",
  card: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  purple: "#c084fc",
  muted: "#6e6e6e",
  label: "#a1a1a1",
  red: "#ef4444",
};

// ── types ─────────────────────────────────────────────────────────────────────
interface DayBucket {
  date: string;
  tokensIn: number;
  tokensOut: number;
  sessions: number;
  apiCalls: number;
}

interface UsageResponse {
  totals: Record<string, number>;
  byDay: DayBucket[];
  models: unknown[];
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

// ── period selector ───────────────────────────────────────────────────────────
type Period = 7 | 14 | 30;

function PeriodButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: "0.1em",
        padding: "4px 10px",
        borderRadius: 4,
        border: `1px solid ${active ? "rgba(192,132,252,0.5)" : C.border}`,
        background: active ? "rgba(192,132,252,0.1)" : "transparent",
        color: active ? C.purple : C.muted,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ── custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const formatted = val >= 1_000_000
    ? `${(val / 1_000_000).toFixed(2)}M`
    : val >= 1_000
    ? `${(val / 1_000).toFixed(1)}K`
    : String(val);

  return (
    <div style={{
      background: "#111",
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "8px 12px",
    }}>
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 10,
        color: C.muted,
        marginBottom: 4,
        letterSpacing: "0.05em",
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 13,
        color: C.purple,
        fontWeight: 600,
      }}>
        {formatted} tokens
      </div>
    </div>
  );
}

// ── number formatter for Y axis ───────────────────────────────────────────────
function fmtY(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

// ── main component ─────────────────────────────────────────────────────────────
export default function UsageTrend() {
  const [period, setPeriod] = useState<Period>(30);

  const { data, error, isLoading } = useSWR<UsageResponse>("/api/usage", fetcher, {
    refreshInterval: 5000,
  });

  const chartData = useMemo(() => {
    const raw = data?.byDay ?? [];
    const slice = raw.slice(-period);
    return slice.map((d) => ({
      date: d.date ? d.date.slice(5) : "", // MM-DD
      tokens: (d.tokensIn ?? 0) + (d.tokensOut ?? 0),
    }));
  }, [data, period]);

  const gradId = "usage-trend-grad";

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <SectionHeader title="THE EPHEMERIS · 30D" />
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {([7, 14, 30] as Period[]).map((p) => (
            <PeriodButton
              key={p}
              label={`${p}D`}
              active={period === p}
              onClick={() => setPeriod(p)}
            />
          ))}
        </div>
      </div>

      {isLoading && (
        <div style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.muted,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
        }}>
          Loading...
        </div>
      )}

      {error && (
        <div style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.red,
          fontFamily: "'Geist Mono', ui-monospace, monospace",
          fontSize: 11,
        }}>
          Failed to load usage data
        </div>
      )}

      {!isLoading && !error && (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.purple} stopOpacity="0.35" />
                <stop offset="100%" stopColor={C.purple} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                fill: C.muted,
              }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmtY}
              tick={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                fill: C.muted,
              }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="tokens"
              stroke={C.purple}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: C.purple, stroke: "none" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
