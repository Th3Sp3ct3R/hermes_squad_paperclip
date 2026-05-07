import { cn } from "@/lib/utils";
import { CaduceusMark } from "@/components/CaduceusMark";

interface CostLedgerProps {
  monthSpendCents: number;
  monthBudgetCents: number;
  byDay: { date: string; costCents: number }[];
  totalCostCents: number;
}

function formatCost(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `${cents}\u00A2`;
}

function CostSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 200;
  const h = 40;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - 4 - (v / max) * (h - 8)}`).join(" ");
  const area = `0,${h} ${points} ${(data.length - 1) * step},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[40px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cost-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22c55e" stopOpacity="0.3" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#cost-fill)" points={area} />
      <polyline
        fill="none"
        stroke="#22c55e"
        strokeWidth="1.4"
        points={points}
        filter="drop-shadow(0 0 3px rgba(34,197,94,.5))"
      />
    </svg>
  );
}

export function CostLedger({ monthSpendCents, monthBudgetCents, byDay, totalCostCents }: CostLedgerProps) {
  const utilPct = monthBudgetCents > 0
    ? Math.round((monthSpendCents / monthBudgetCents) * 100)
    : 0;

  // Gauge color thresholds
  const gaugeColor = utilPct > 90 ? "#ef4444" : utilPct > 70 ? "#f59e0b" : "#22c55e";

  // Compute week-over-week trend
  const dailyCosts = byDay.map((d) => d.costCents ?? 0);
  const thisWeek = dailyCosts.slice(-7).reduce((a, b) => a + b, 0);
  const lastWeek = dailyCosts.slice(-14, -7).reduce((a, b) => a + b, 0);
  const weekTrend = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="seclabel g"><CaduceusMark /> Cost Ledger</h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">30D</span>
      </div>

      {/* Hero spend number */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[36px] font-semibold tabular-nums tracking-tight leading-none" style={{ color: gaugeColor }}>
            {formatCost(monthSpendCents)}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">Month Spend</span>
            {weekTrend !== 0 && (
              <span className={cn(
                "text-[11px] font-mono tabular-nums",
                weekTrend > 0 ? "text-[#ff8a8a]" : "text-emerald-400",
              )}>
                {weekTrend > 0 ? "+" : ""}{weekTrend}% WoW
              </span>
            )}
          </div>
        </div>
        {totalCostCents > 0 && (
          <div className="text-right">
            <div className="text-[20px] font-semibold tabular-nums tracking-tight leading-none glow-w">
              {formatCost(totalCostCents)}
            </div>
            <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">30D Total</span>
          </div>
        )}
      </div>

      {/* Budget gauge */}
      {monthBudgetCents > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[0.06em] uppercase text-[#6e6e6e]">
              Budget {formatCost(monthBudgetCents)}
            </span>
            <span className="font-mono text-[11px] tabular-nums font-medium" style={{ color: gaugeColor }}>
              {utilPct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(utilPct, 100)}%`,
                background: gaugeColor,
                boxShadow: `0 0 8px ${gaugeColor}40`,
              }}
            />
          </div>
        </div>
      )}

      {/* Daily cost mini-chart */}
      {dailyCosts.length > 1 && (
        <div>
          <CostSparkline data={dailyCosts} />
          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground font-mono">
            <span>{byDay[0]?.date?.slice(5)}</span>
            <span>{byDay[byDay.length - 1]?.date?.slice(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
