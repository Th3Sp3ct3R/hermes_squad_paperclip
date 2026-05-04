import { cn } from "@/lib/utils";

interface UsageByDay {
  date: string;
  tokens: number;
  calls: number;
}

interface WorkspacePulseProps {
  sessions: number;
  totalTokens: number;
  totalCalls: number;
  cacheHitRate: number;
  activeModel: string | null;
  activeModelCalls: number;
  activeModelSessions: number;
  byDay: UsageByDay[];
  sessionsTrend?: number;
  tokensTrend?: number;
}

function formatTokens(n: number): { value: string; suffix: string } {
  if (n >= 1_000_000) return { value: (n / 1_000_000).toFixed(2), suffix: "M" };
  if (n >= 1_000) return { value: (n / 1_000).toFixed(1), suffix: "K" };
  return { value: String(n), suffix: "" };
}

function SaberSparkline({ data, color }: { data: number[]; color: "luke" | "vader" | "mace" | "white" }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 160;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${42 - (v / max) * 36}`).join(" ");
  const area = `0,46 ${points} ${(data.length - 1) * step},46`;

  const colors = {
    luke:  { stroke: "#4ea8ff", glow: "rgba(78,168,255,.6)",  fill: "rgba(78,168,255,.25)" },
    vader: { stroke: "#ff2d2d", glow: "rgba(255,45,45,.55)",  fill: "rgba(255,45,45,.2)" },
    mace:  { stroke: "#b964ff", glow: "rgba(185,100,255,.6)", fill: "rgba(185,100,255,.25)" },
    white: { stroke: "#ffffff", glow: "rgba(255,255,255,.5)", fill: "rgba(255,255,255,.15)" },
  };
  const c = colors[color];

  return (
    <svg viewBox={`0 0 ${w} 46`} className="h-[42px] w-[140px] flex-shrink-0" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sp-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={c.stroke} stopOpacity="0.4" />
          <stop offset="1" stopColor={c.stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#sp-${color})`} points={area} />
      <polyline
        className="draw"
        fill="none"
        stroke={c.stroke}
        strokeWidth="1.4"
        points={points}
        filter={`drop-shadow(0 0 4px ${c.glow})`}
      />
    </svg>
  );
}

function TrendBadge({ value }: { value?: number }) {
  if (value === undefined || value === 0) return null;
  const positive = value > 0;
  return (
    <span className={cn(
      "text-[11px] font-mono tabular-nums",
      positive ? "text-emerald-400" : "text-[#ff8a8a]",
    )}>
      {positive ? "+" : ""}{value}%
    </span>
  );
}

function PulseCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded border border-[rgba(255,255,255,0.14)] bg-transparent px-5 py-[18px] relative overflow-hidden",
      "opacity-0 translate-y-1.5 animate-[card-rise_0.5s_ease-out_forwards]",
      className,
    )}>
      {children}
    </div>
  );
}

export function WorkspacePulse({
  sessions,
  totalTokens,
  totalCalls,
  cacheHitRate,
  activeModel,
  activeModelCalls,
  activeModelSessions,
  byDay,
  sessionsTrend,
  tokensTrend,
}: WorkspacePulseProps) {
  const tok = formatTokens(totalTokens);
  const cached = formatTokens(Math.round(totalTokens * (cacheHitRate / 100)));
  const sparkData = byDay.map((d) => d.tokens);

  return (
    <div>
      <div className="seclabel w mb-3">
        <span className="lc" /> WORKSPACE PULSE <span style={{ color: "var(--muted-foreground)", opacity: 0.5 }}>·</span> 30D
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
        {/* Sessions */}
        <PulseCard className="[animation-delay:20ms]">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#a1a1a1] font-medium">Sessions</span>
          <div className="flex items-end justify-between mt-2.5">
            <div>
              <span className="text-[36px] font-semibold tabular-nums tracking-tight leading-none glow-w">{sessions}</span>
              <div className="flex items-center gap-2 mt-2">
                <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">30D</span>
                <TrendBadge value={sessionsTrend} />
              </div>
            </div>
            <SaberSparkline data={sparkData.slice(-14)} color="luke" />
          </div>
        </PulseCard>

        {/* Tokens */}
        <PulseCard className="[animation-delay:60ms]">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#a1a1a1] font-medium">Tokens</span>
          <div className="mt-2.5">
            <div className="flex items-baseline gap-1">
              <span className="text-[36px] font-semibold tabular-nums tracking-tight leading-none glow-p">{tok.value}</span>
              <span className="text-[18px] text-[#6e6e6e] font-medium">{tok.suffix}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">{cached.value}{cached.suffix} cached</span>
              <TrendBadge value={tokensTrend} />
            </div>
          </div>
        </PulseCard>

        {/* API Calls */}
        <PulseCard className="[animation-delay:100ms]">
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#a1a1a1] font-medium">API Calls</span>
          <div className="flex items-end justify-between mt-2.5">
            <div>
              <span className="text-[36px] font-semibold tabular-nums tracking-tight leading-none glow-r">{totalCalls}</span>
              <div className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e] mt-2">30D Window</div>
            </div>
            <SaberSparkline data={byDay.map((d) => d.calls).slice(-14)} color="vader" />
          </div>
        </PulseCard>

        {/* Active Model */}
        <PulseCard className="[animation-delay:140ms]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#a1a1a1] font-medium">Active Model</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-400 bg-emerald-500/[0.06] border border-emerald-500/25 px-2 py-0.5 rounded tracking-[0.06em] uppercase">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px #34d399" }} />
              Online
            </span>
          </div>
          <div className="mt-2.5">
            <span className="text-[24px] font-semibold tracking-tight leading-tight glow-w truncate block">{activeModel ?? "—"}</span>
            <div className="flex items-center gap-3.5 mt-2.5 font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e] flex-wrap">
              <span>
                <span className="glow-b font-semibold">{activeModelCalls > 0 ? `${Math.round((activeModelCalls / Math.max(totalCalls, 1)) * 100)}%` : "—"}</span>
                {" "}of calls
              </span>
              <span>{activeModelSessions} sessions</span>
            </div>
          </div>
        </PulseCard>
      </div>
    </div>
  );
}
