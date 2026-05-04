import type { Agent } from "@paperclipai/shared";

interface AgentActivityBarProps {
  agents: Agent[];
  totalCalls: number;
  cacheHitRate: number;
  computeHours?: number;
}

export function AgentActivityBar({ agents, totalCalls, cacheHitRate, computeHours }: AgentActivityBarProps) {
  const total = agents.length;
  const active = agents.filter((a) => a.status === "active" || a.status === "running").length;
  const working = agents.filter((a) => a.status === "running").length;
  const errored = agents.filter((a) => a.status === "error").length;

  return (
    <section
      className="rounded border border-[rgba(255,255,255,0.14)] relative overflow-hidden"
      style={{ background: "var(--background, #09090B)" }}
      aria-label="Agent Activity"
    >
      {/* Ambient gradient overlay */}
      <div
        className="absolute inset-[-1px] pointer-events-none rounded"
        style={{
          background: "linear-gradient(180deg, rgba(78,168,255,.07), transparent 35%), radial-gradient(600px 200px at 100% 0%, rgba(185,100,255,.08), transparent 70%)",
        }}
      />

      <div className="relative px-6 py-[22px]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Left: Status headline */}
          <div>
            <div className="seclabel w" style={{ marginBottom: 10 }}>
              <span className="lc" /> Agent Activity · Live
            </div>

            <h1 className="text-[34px] font-semibold tracking-tight leading-none flex items-baseline flex-wrap gap-x-1">
              <span className="glow-w">{total} agents</span>
              <span className="text-[#a1a1a1] font-normal"> · </span>
              <span className="glow-b">{active} active</span>
              <span className="text-[#a1a1a1] font-normal"> · </span>
              <span className="glow-p">{working} working</span>
              {errored > 0 && (
                <>
                  <span className="text-[#a1a1a1] font-normal"> · </span>
                  <span className="glow-r">{errored} error</span>
                </>
              )}
            </h1>

            <div className="text-[14px] text-[#a1a1a1] mt-2">
              Subagent fleet · v0.1.0
            </div>
          </div>

          {/* Right: Quick stats */}
          <div className="flex items-center gap-6">
            <div className="font-mono">
              <div className="text-[18px] tracking-tight glow-w">{totalCalls}</div>
              <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#6e6e6e] mt-0.5">Tool Calls / 1H</div>
            </div>
            <div className="font-mono">
              <div className="text-[18px] tracking-tight glow-b">{cacheHitRate}%</div>
              <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#6e6e6e] mt-0.5">Cache Hit</div>
            </div>
            {computeHours !== undefined && (
              <div className="font-mono">
                <div className="text-[18px] tracking-tight glow-p">{computeHours}h</div>
                <div className="text-[10.5px] tracking-[0.14em] uppercase text-[#6e6e6e] mt-0.5">Compute · 7D</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
