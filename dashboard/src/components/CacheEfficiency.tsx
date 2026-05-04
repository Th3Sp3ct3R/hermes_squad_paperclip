"use client";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#000",
  card: "#0a0a0a",
  border: "rgba(255,255,255,0.08)",
  green: "#10b981",
  red: "#ef4444",
  muted: "#6e6e6e",
  label: "#a1a1a1",
  purple: "#c084fc",
};

// ── types ─────────────────────────────────────────────────────────────────────
interface CacheDay {
  date: string;
  hits: number;
  misses: number;
  total: number;
  hitRate: number;
}

interface CacheResponse {
  overall: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    totalRequests: number;
  };
  byDay: CacheDay[];
}

interface UsageResponse {
  totals: {
    cacheHits: number;
    cacheReads: number;
    sessions?: number;
    apiCalls?: number;
  };
  byDay: Array<{
    date: string;
    cacheHits: number;
    cacheReads: number;
  }>;
  models: unknown[];
}

// ── bucket 30 days into weekly groups ────────────────────────────────────────
interface WeekBucket {
  week: string;
  hits: number;
  misses: number;
}

function toWeeklyBuckets(days: Array<{ date: string; cacheHits: number; cacheReads: number }>): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    const hits = slice.reduce((s, d) => s + (d.cacheHits ?? 0), 0);
    const reads = slice.reduce((s, d) => s + (d.cacheReads ?? 0), 0);
    const misses = Math.max(0, reads - hits);
    const startDate = slice[0]?.date?.slice(5) ?? `W${Math.floor(i / 7) + 1}`;
    buckets.push({ week: startDate, hits, misses });
  }
  return buckets;
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, meta }: { title: string; meta?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <div style={{ width: 3, height: 16, background: C.green, borderRadius: 2, flexShrink: 0 }} />
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
      {meta && <div style={{ marginLeft: "auto" }}>{meta}</div>}
    </div>
  );
}

// ── custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#111",
      border: `1px solid ${C.border}`,
      borderRadius: 6,
      padding: "8px 12px",
      minWidth: 120,
    }}>
      <div style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 10,
        color: C.muted,
        marginBottom: 6,
      }}>
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 3,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.fill }} />
          <span style={{
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 11,
            color: "#e5e5e5",
          }}>
            {p.name}: {p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export default function CacheEfficiency() {
  // Try /api/cache first, fall back to /api/usage
  const { data: cacheData } = useSWR<CacheResponse>("/api/cache", fetcher, { refreshInterval: 5000 });
  const { data: usageData, error, isLoading } = useSWR<UsageResponse>("/api/usage", fetcher, { refreshInterval: 5000 });

  // Build chart data from either source
  const chartData: WeekBucket[] = (() => {
    if (cacheData?.byDay?.length) {
      // Use dedicated cache endpoint
      const buckets: WeekBucket[] = [];
      for (let i = 0; i < cacheData.byDay.length; i += 7) {
        const slice = cacheData.byDay.slice(i, i + 7);
        const hits = slice.reduce((s, d) => s + (d.hits ?? 0), 0);
        const misses = slice.reduce((s, d) => s + (d.misses ?? 0), 0);
        const label = slice[0]?.date?.slice(5) ?? `W${Math.floor(i / 7) + 1}`;
        buckets.push({ week: label, hits, misses });
      }
      return buckets;
    }
    if (usageData?.byDay?.length) {
      return toWeeklyBuckets(usageData.byDay);
    }
    return [];
  })();

  // Overall hit rate
  const hitRate: number = (() => {
    if (cacheData?.overall?.hitRate != null) return cacheData.overall.hitRate;
    const totals = usageData?.totals;
    if (!totals) return 0;
    const reads = totals.cacheReads ?? 0;
    const hits = totals.cacheHits ?? 0;
    return reads > 0 ? hits / reads : 0;
  })();

  const hitRateDisplay = `${(hitRate * 100).toFixed(1)}%`;

  const metaNode = (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 11,
        color: C.muted,
        letterSpacing: "0.08em",
      }}>
        HIT RATE
      </span>
      <span style={{
        fontFamily: "'Geist Mono', ui-monospace, monospace",
        fontSize: 13,
        color: C.green,
        fontWeight: 700,
      }}>
        {hitRateDisplay}
      </span>
    </div>
  );

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "20px 24px",
    }}>
      <SectionHeader title="CACHE EFFICIENCY · 30D" meta={metaNode} />

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
          Failed to load cache data
        </div>
      )}

      {!isLoading && !error && (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={3}>
              <XAxis
                dataKey="week"
                tick={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  fontSize: 10,
                  fill: C.muted,
                }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  fontSize: 10,
                  fill: C.muted,
                }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend
                wrapperStyle={{
                  fontFamily: "'Geist Mono', ui-monospace, monospace",
                  fontSize: 10,
                  color: C.muted,
                  letterSpacing: "0.08em",
                  paddingTop: 12,
                }}
                iconType="square"
                iconSize={8}
              />
              <Bar dataKey="hits" name="Hits" fill={C.green} radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Bar dataKey="misses" name="Misses" fill={`rgba(239,68,68,0.5)`} radius={[2, 2, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>

          {chartData.length === 0 && (
            <div style={{
              textAlign: "center",
              color: C.muted,
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              paddingTop: 16,
            }}>
              No cache data for this period
            </div>
          )}
        </>
      )}
    </div>
  );
}
