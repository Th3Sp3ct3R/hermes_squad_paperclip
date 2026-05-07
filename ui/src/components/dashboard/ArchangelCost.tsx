import { CaduceusMark } from "@/components/CaduceusMark";
import type { CostByAgent } from "@paperclipai/shared";

interface ArchangelCostProps {
  byAgent: CostByAgent[];
}

function formatCost(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  if (cents > 0) return `${cents}\u00A2`;
  return "$0";
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// Agent color palette (same muted tones as the rest of the dashboard)
const AGENT_COLORS = [
  "#b964ff", "#4ea8ff", "#ff2d2d", "#22c55e",
  "#f59e0b", "#06b6d4", "#ec4899", "#a855f7",
];

export function ArchangelCost({ byAgent }: ArchangelCostProps) {
  if (!byAgent || byAgent.length === 0) {
    return (
      <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
        <h3 className="seclabel p mb-3"><CaduceusMark /> Archangel Cost</h3>
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          No agent cost data yet
        </div>
      </div>
    );
  }

  const totalCost = byAgent.reduce((s, a) => s + a.costCents, 0) || 1;
  const sorted = [...byAgent].sort((a, b) => b.costCents - a.costCents).slice(0, 8);

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="seclabel p"><CaduceusMark /> Archangel Cost</h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
          <span className="text-[#ededed] font-medium">{formatCost(totalCost)}</span> total
        </span>
      </div>

      <div className="space-y-2.5">
        {sorted.map((agent, i) => {
          const pct = Math.round((agent.costCents / totalCost) * 100);
          const color = AGENT_COLORS[i % AGENT_COLORS.length];
          const totalTokens = agent.inputTokens + agent.outputTokens;

          return (
            <div key={agent.agentId} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-sm font-medium truncate">
                    {agent.agentName ?? agent.agentId.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-[11px] tabular-nums text-[#6e6e6e]">
                    {formatTokens(totalTokens)} tok
                  </span>
                  <span className="font-mono text-[11px] tabular-nums font-medium text-[#ededed] w-14 text-right">
                    {formatCost(agent.costCents)}
                  </span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    background: color,
                    opacity: 0.7,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
