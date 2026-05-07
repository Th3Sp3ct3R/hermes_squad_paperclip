import { cn } from "@/lib/utils";
import { CaduceusMark } from "@/components/CaduceusMark";

interface ProviderData {
  provider: string;
  calls: number;
  successes: number;
  failures: number;
  avgDurationMs: number;
  costCents: number;
}

interface ProviderHealthProps {
  providers: ProviderData[];
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function StatusDot({ rate }: { rate: number }) {
  const color = rate >= 95 ? "#22c55e" : rate >= 80 ? "#f59e0b" : "#ef4444";
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
      style={{
        background: color,
        boxShadow: `0 0 6px ${color}80`,
      }}
    />
  );
}

export function ProviderHealth({ providers }: ProviderHealthProps) {
  if (!providers || providers.length === 0) {
    return (
      <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
        <h3 className="seclabel b mb-3"><CaduceusMark /> Provider Health</h3>
        <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
          No provider data yet
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="seclabel b"><CaduceusMark /> Provider Health</h3>
        <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">30D</span>
      </div>

      <div className="space-y-3">
        {providers.map((p) => {
          const successRate = p.calls > 0
            ? Math.round((p.successes / p.calls) * 100)
            : 100;

          return (
            <div
              key={p.provider}
              className="flex items-center gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] px-3.5 py-2.5"
            >
              <StatusDot rate={successRate} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.provider}</div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className={cn(
                    "font-mono text-[11px] tabular-nums font-medium",
                    successRate >= 95 ? "text-emerald-400" : successRate >= 80 ? "text-amber-400" : "text-red-400",
                  )}>
                    {successRate}% success
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-[#6e6e6e]">
                    {p.calls} calls
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-[#6e6e6e]">
                    ~{formatMs(p.avgDurationMs)}
                  </span>
                </div>
              </div>
              {p.failures > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-red-400 shrink-0">
                  {p.failures} err
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
