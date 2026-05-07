import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { usageStatsApi } from "../api/usageStats";
import { costsApi } from "../api/costs";
import { sunoPipelineApi, SUNO_CHAKRA_FREQUENCIES } from "../api/sunoPipeline";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";
import { PriorityIcon } from "../components/PriorityIcon";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { Bot, LayoutDashboard } from "lucide-react";
import { ArchangelAvatar } from "@/components/ArchangelAvatar";
import { CaduceusMark } from "@/components/CaduceusMark";
import { HermeticPanelsRow } from "@/components/dashboard/HermeticPanels";
import { MechanismRow } from "@/components/dashboard/HermeticMechanism";
import { TelemetryRow } from "@/components/dashboard/HermeticTelemetry";
import { HermeticLegendButton, HermeticLegendDrawer } from "@/components/dashboard/HermeticLegend";
import { PageSkeleton } from "../components/PageSkeleton";
import { WorkspacePulse } from "../components/dashboard/WorkspacePulse";
import { AgentActivityBar } from "../components/dashboard/AgentActivityBar";
import { CostLedger } from "../components/dashboard/CostLedger";
import { ArchangelCost } from "../components/dashboard/ArchangelCost";
import { ProviderHealth } from "../components/dashboard/ProviderHealth";
import { HermesVoice } from "../components/HermesVoice";
import type { Agent, Issue } from "@paperclipai/shared";
import type { ArchangelName } from "@/components/SacredGeometry";

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// ── Archangel Org Chart — Sacred Hierarchy ──────────────────────────────────
//
// Kabbalistic hierarchy (Metatron = Keter, above all):
//   Crown:  Metatron (Celestial Scribe — sees all, records all)
//   Apex:   Michael (Commander — dispatches the pipeline)
//   Triad:  Uriel → Zadkiel → Jophiel (creative generation)
//   Gate:   Raziel → Raphael (engineering + quality)
//   Earth:  Gabriel → Sandalphon → Cassiel (delivery)

interface OrgAgent {
  name: ArchangelName;
  role: string;
}

function AgentNode({ agent, size, working }: { agent: OrgAgent; size: "xl" | "lg" | "md"; working: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 group">
      <div className="relative transition-transform duration-300 group-hover:scale-105">
        <ArchangelAvatar name={agent.name} size={size} working={working} />
        <span className={cn(
          "absolute bottom-0.5 right-0.5 rounded-full border-2 border-background transition-colors",
          size === "xl" ? "h-4 w-4" : "h-3 w-3",
          working ? "bg-emerald-500 animate-pulse" : "bg-yellow-500/70",
        )} />
      </div>
      <span className={cn(
        "font-semibold text-center leading-tight glow-text",
        size === "xl" ? "text-base" : "text-sm",
      )}>
        {agent.name}
      </span>
      <span className={cn(
        "text-muted-foreground/80 text-center leading-tight",
        size === "xl" ? "text-xs" : "text-[11px]",
      )}>
        {agent.role}
      </span>
    </div>
  );
}

function TreeLine({ height = 20, className }: { height?: number; className?: string }) {
  return <div className={cn("w-px bg-border/25", className)} style={{ height }} />;
}

function TreeBranch({ width = 200 }: { width?: number }) {
  return <div className="h-px bg-border/25" style={{ width }} />;
}

function ArchangelOrgChart({ agentsRunning }: { agentsRunning: boolean }) {
  return (
    <div className="rounded-xl border border-border/30 bg-gradient-to-b from-card/60 to-card/20 px-6 py-8">
      <div className="flex flex-col items-center gap-0">

        {/* ── Crown: Metatron — Keter — above all ── */}
        <AgentNode
          agent={{ name: "Metatron", role: "Celestial Scribe" }}
          size="xl"
          working={agentsRunning}
        />
        <TreeLine height={24} />

        {/* ── Apex: Michael — Commander ── */}
        <AgentNode
          agent={{ name: "Michael", role: "Commander" }}
          size="xl"
          working={agentsRunning}
        />
        <TreeLine height={20} />
        <TreeBranch width={340} />

        {/* ── Creative Triad: Uriel / Zadkiel / Jophiel ── */}
        <div className="flex justify-center gap-12 mt-1">
          {([
            { name: "Uriel" as ArchangelName, role: "Sound Prompt" },
            { name: "Zadkiel" as ArchangelName, role: "Lyricist" },
            { name: "Jophiel" as ArchangelName, role: "Visual Art" },
          ]).map((a) => (
            <div key={a.name} className="flex flex-col items-center">
              <TreeLine height={12} />
              <AgentNode agent={a} size="lg" working={agentsRunning} />
            </div>
          ))}
        </div>

        <TreeLine height={16} className="mt-2" />
        <TreeBranch width={220} />

        {/* ── Gate: Raziel / Raphael ── */}
        <div className="flex justify-center gap-16 mt-1">
          {([
            { name: "Raziel" as ArchangelName, role: "Audio Engineer" },
            { name: "Raphael" as ArchangelName, role: "Reviewer" },
          ]).map((a) => (
            <div key={a.name} className="flex flex-col items-center">
              <TreeLine height={12} />
              <AgentNode agent={a} size="lg" working={agentsRunning} />
            </div>
          ))}
        </div>

        <TreeLine height={16} className="mt-2" />
        <TreeBranch width={300} />

        {/* ── Earth: Gabriel / Sandalphon / Cassiel ── */}
        <div className="flex justify-center gap-10 mt-1">
          {([
            { name: "Gabriel" as ArchangelName, role: "Release Copy" },
            { name: "Sandalphon" as ArchangelName, role: "Publisher" },
            { name: "Cassiel" as ArchangelName, role: "Video" },
          ]).map((a) => (
            <div key={a.name} className="flex flex-col items-center">
              <TreeLine height={12} />
              <AgentNode agent={a} size="md" working={agentsRunning} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Live Agent Activity Feed ────────────────────────────────────────────────

function AgentActivityFeed({ agents, runs }: { agents?: Agent[]; runs?: { agentId?: string; status?: string; startedAt?: string; finishedAt?: string }[] }) {
  const activeRuns = useMemo(() => {
    if (!runs || !agents) return [];
    const agentMap = new Map(agents.map((a) => [a.id, a]));
    return runs
      .filter((r) => r.status === "running" || r.status === "active")
      .map((r) => ({
        agent: r.agentId ? agentMap.get(r.agentId) : undefined,
        run: r,
      }))
      .filter((r) => r.agent)
      .slice(0, 5);
  }, [agents, runs]);

  if (activeRuns.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/30 p-4">
        <h3 className="section-header mb-3">
          Agent Activity
        </h3>
        <div className="flex items-center gap-3 py-6 justify-center">
          <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="text-sm text-muted-foreground">All agents idle</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/30 p-4">
      <h3 className="seclabel e mb-3">
        <CaduceusMark /> The Akashic Stream
      </h3>
      <div className="space-y-2">
        {activeRuns.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 animate-pulse"
          >
            <ArchangelAvatar
              name={(item.agent?.name ?? "?") as ArchangelName}
              size="md"
              working
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{item.agent?.name}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] text-emerald-400 font-mono">working...</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Full-width dual-axis area chart for The Ephemeris */
function EphemerisChart({ byDay }: { byDay: { date: string; tokens: number; calls: number; costCents: number }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const maxTokens = Math.max(...byDay.map((d) => d.tokens ?? 0), 1);
  const maxCost = Math.max(...byDay.map((d) => d.costCents ?? 0), 1);
  const w = 600;
  const h = 140;
  const padTop = 8;
  const padBot = 4;
  const usableH = h - padTop - padBot;

  const tokenPoints = byDay
    .map((d, i) => {
      const x = (i / Math.max(byDay.length - 1, 1)) * w;
      const y = padTop + usableH - (d.tokens / maxTokens) * usableH;
      return `${x},${y}`;
    })
    .join(" ");

  const costPoints = byDay
    .map((d, i) => {
      const x = (i / Math.max(byDay.length - 1, 1)) * w;
      const y = padTop + usableH - ((d.costCents ?? 0) / maxCost) * usableH;
      return `${x},${y}`;
    })
    .join(" ");

  const tokenArea = `0,${h} ${tokenPoints} ${w},${h}`;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const idx = Math.round(pct * (byDay.length - 1));
    setHoverIdx(Math.max(0, Math.min(idx, byDay.length - 1)));
  };

  const hovered = hoverIdx != null ? byDay[hoverIdx] : null;

  return (
    <div className="space-y-1">
      {/* Tooltip row */}
      <div className="flex items-center justify-between h-5">
        {hovered ? (
          <>
            <span className="font-mono text-[11px] text-[#ededed]">{hovered.date}</span>
            <div className="flex items-center gap-4">
              <span className="font-mono text-[11px] tabular-nums text-[#4ea8ff]">
                {formatNumber(hovered.tokens)} tokens
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#22c55e]">
                {(hovered.costCents ?? 0) >= 100 ? `$${((hovered.costCents ?? 0) / 100).toFixed(2)}` : `${hovered.costCents ?? 0}\u00A2`}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[#6e6e6e]">
                {hovered.calls} calls
              </span>
            </div>
          </>
        ) : (
          <>
            <div />
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#6e6e6e]">
                <span className="h-1.5 w-4 rounded-full bg-[#4ea8ff]/60 inline-block" /> Tokens
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#6e6e6e]">
                <span className="h-0.5 w-4 rounded-full bg-[#22c55e] inline-block" /> Cost
              </span>
            </div>
          </>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-[140px]"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="eph-token-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#4ea8ff" stopOpacity="0.25" />
            <stop offset="1" stopColor="#4ea8ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Token area fill */}
        <polygon fill="url(#eph-token-fill)" points={tokenArea} />
        {/* Token line */}
        <polyline
          fill="none"
          stroke="#4ea8ff"
          strokeWidth="1.6"
          points={tokenPoints}
          filter="drop-shadow(0 0 3px rgba(78,168,255,.4))"
        />
        {/* Cost line (dashed) */}
        <polyline
          fill="none"
          stroke="#22c55e"
          strokeWidth="1.2"
          strokeDasharray="4,3"
          points={costPoints}
          opacity="0.8"
        />
        {/* Hover indicator */}
        {hoverIdx != null && (
          <line
            x1={(hoverIdx / Math.max(byDay.length - 1, 1)) * w}
            x2={(hoverIdx / Math.max(byDay.length - 1, 1)) * w}
            y1={0}
            y2={h}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1"
          />
        )}
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
        <span>{byDay[0]?.date?.slice(5)}</span>
        <span>{byDay[Math.floor(byDay.length / 2)]?.date?.slice(5)}</span>
        <span>{byDay[byDay.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { selectedCompanyId, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const [legendOpen, setLegendOpen] = useState(false);
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "The Observatory" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: activity } = useQuery({
    queryKey: queryKeys.activity(selectedCompanyId!),
    queryFn: () => activityApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: issues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: runs } = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: usageStats } = useQuery({
    queryKey: queryKeys.usageStats(selectedCompanyId!, 30),
    queryFn: () => usageStatsApi.get(selectedCompanyId!, 30),
    enabled: !!selectedCompanyId,
  });

  // Cost data for CostLedger and ArchangelCost panels
  const { data: costByAgent } = useQuery({
    queryKey: ["costs-by-agent", selectedCompanyId ?? "_"] as const,
    queryFn: () => costsApi.byAgent(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Suno issues for the Hermetic panel row (Magnum Opus / Eighth Sphere).
  const { data: sunoIssues } = useQuery({
    queryKey: ["suno-pipeline", selectedCompanyId ?? "_"] as const,
    queryFn: () => sunoPipelineApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  // Compute 7-day trends for WorkspacePulse
  const { sessionsTrend, tokensTrend } = useMemo(() => {
    const byDay = usageStats?.byDay ?? [];
    if (byDay.length < 8) return { sessionsTrend: undefined, tokensTrend: undefined };
    const thisWeekTokens = byDay.slice(-7).reduce((s, d) => s + d.tokens, 0);
    const lastWeekTokens = byDay.slice(-14, -7).reduce((s, d) => s + d.tokens, 0);
    const thisWeekCalls = byDay.slice(-7).reduce((s, d) => s + d.calls, 0);
    const lastWeekCalls = byDay.slice(-14, -7).reduce((s, d) => s + d.calls, 0);
    return {
      sessionsTrend: lastWeekCalls > 0 ? Math.round(((thisWeekCalls - lastWeekCalls) / lastWeekCalls) * 100) : undefined,
      tokensTrend: lastWeekTokens > 0 ? Math.round(((thisWeekTokens - lastWeekTokens) / lastWeekTokens) * 100) : undefined,
    };
  }, [usageStats?.byDay]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;
  const agentsRunning = (data?.agents.running ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Hermetic axiom — Tabula Smaragdina, sets the frame for everything below */}
      <header
        className="flex items-center justify-center gap-3 py-1"
        title="Tabula Smaragdina — As above, so below"
      >
        <span className="font-serif italic text-[11px] uppercase tracking-[0.4em] text-muted-foreground/50 select-none">
          Quod est superius est sicut quod est inferius
        </span>
        <HermeticLegendButton onClick={() => setLegendOpen(true)} />
        <HermeticLegendDrawer
          open={legendOpen}
          onOpenChange={setLegendOpen}
          withTrigger={false}
        />
      </header>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {hasNoAgents && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You have no agents.
            </p>
          </div>
          <button
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
            className="text-sm font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 underline underline-offset-2 shrink-0"
          >
            Create one here
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ── 0. Workspace Pulse — stats strip ───────────────────── */}
          <WorkspacePulse
            sessions={data.tasks.inProgress + data.tasks.open}
            totalTokens={usageStats?.totalTokens ?? 0}
            totalCalls={usageStats?.totalCalls ?? 0}
            cacheHitRate={usageStats?.cacheHitRate ?? 0}
            activeModel={usageStats?.byModel?.[0]?.model ?? null}
            activeModelCalls={usageStats?.byModel?.[0]?.calls ?? 0}
            activeModelSessions={0}
            byDay={usageStats?.byDay ?? []}
            sessionsTrend={sessionsTrend}
            tokensTrend={tokensTrend}
          />

          {/* ── 0.5. Agent Activity Bar ────────────────────────────── */}
          <AgentActivityBar
            agents={agents ?? []}
            totalCalls={usageStats?.totalCalls ?? 0}
            cacheHitRate={usageStats?.cacheHitRate ?? 0}
          />

          {/* ── 3. The Ephemeris — Full-width Usage Trend ──────────────── */}
          <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="seclabel b"><CaduceusMark /> The Ephemeris</h3>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {["7D", "14D", "30D"].map(p => (
                    <button key={p} className={cn("px-2 py-0.5 text-[10px] rounded", p === "30D" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {usageStats && usageStats.byDay.length > 0 ? (
              <EphemerisChart byDay={usageStats.byDay} />
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No usage data yet
              </div>
            )}
          </div>

          {/* ── 3.5. Daemons + Cost Ledger + Provider Health ──────────── */}
          <div className="grid md:grid-cols-3 gap-[14px]">
            {/* The Daemons — Top Models with progress bars */}
            <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
              <h3 className="seclabel p mb-3"><CaduceusMark /> The Daemons</h3>
              <div className="space-y-3">
                {usageStats && usageStats.byModel.length > 0 ? (
                  usageStats.byModel.slice(0, 6).map((m, i) => {
                    const totalCalls = usageStats.totalCalls || 1;
                    const pct = Math.round((m.calls / totalCalls) * 100);
                    const cost = m.costCents ?? 0;
                    const costStr = cost >= 100
                      ? `$${(cost / 100).toFixed(2)}`
                      : cost > 0 ? `${cost}\u00A2` : "$0";
                    return (
                      <div key={m.model} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm truncate mr-2 flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-[#6e6e6e]">#{i + 1}</span>
                            {m.model}
                          </span>
                          <span className="font-mono text-[10px] tabular-nums text-[#6e6e6e] shrink-0">
                            {costStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                background: i === 0 ? "#b964ff" : "rgba(255,255,255,0.25)",
                              }}
                            />
                          </div>
                          <span className="font-mono text-[10px] tabular-nums text-[#6e6e6e] w-16 text-right shrink-0">
                            {pct}% · {formatNumber(m.calls)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>minimax/minimax-m2.5:free</span>
                      <span className="text-muted-foreground">&mdash;</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>music-2.6-free</span>
                      <span className="text-[10px] text-muted-foreground">MiniMax direct</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cost Ledger */}
            <CostLedger
              monthSpendCents={data.costs.monthSpendCents}
              monthBudgetCents={data.costs.monthBudgetCents}
              byDay={usageStats?.byDay ?? []}
              totalCostCents={usageStats?.totalCostCents ?? 0}
            />

            {/* Provider Health */}
            <ProviderHealth providers={usageStats?.byProvider ?? []} />
          </div>

          {/* ── Hermes: Sessions Intelligence + Memoria + Grimoire + Archangel Cost ── */}
          <div className="grid md:grid-cols-3 gap-[14px]">
            {/* Sessions Intelligence — 2/3 width */}
            <div className="md:col-span-2">
              <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="seclabel w">
                    <CaduceusMark /> The Hermetica
                  </h3>
                  <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
                    <span className="text-[#ededed] font-medium">{recentActivity.length}</span> recent
                  </span>
                </div>
                <div className="space-y-1">
                  {recentActivity.slice(0, 8).map((event) => (
                    <div key={event.id} className="flex items-start gap-3 rounded-lg border border-border/20 bg-card/20 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{event.action}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {event.agentId && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {agentMap.get(event.agentId)?.name ?? "agent"}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground">{timeAgo(event.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                      No session data yet
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right column — stacked cards */}
            <div className="space-y-[14px]">
              {/* Cache Efficiency — Memoria */}
              <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="seclabel b"><CaduceusMark /> Memoria</h3>
                  <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">30D</span>
                </div>
                {usageStats && usageStats.totalCalls > 0 ? (
                  <>
                    <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none glow-w">
                      {usageStats.cacheHitRate}%
                      <span className="font-mono text-[11px] text-[#6e6e6e] ml-2 tracking-[0.08em] uppercase font-medium">Hit Rate</span>
                    </div>
                    {/* Cache bar visualization */}
                    <div className="mt-3 space-y-1.5">
                      <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${usageStats.cacheHitRate}%`,
                            background: "linear-gradient(90deg, #4ea8ff, #22c55e)",
                            boxShadow: "0 0 8px rgba(78,168,255,0.3)",
                          }}
                        />
                      </div>
                      <div className="flex justify-between">
                        <span className="font-mono text-[10px] text-[#6e6e6e]">
                          {formatNumber(Math.round(usageStats.totalTokens * (usageStats.cacheHitRate / 100)))} cached
                        </span>
                        <span className="font-mono text-[10px] text-[#6e6e6e]">
                          {formatNumber(usageStats.totalTokens)} total
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[42px] font-semibold tabular-nums tracking-tight leading-none text-[#404040]">&mdash;</div>
                    <span className="font-mono text-[11px] text-[#6e6e6e]">No cache data yet</span>
                  </>
                )}
              </div>

              {/* Agent Skills — Grimoire */}
              <div className="rounded border border-[rgba(255,255,255,0.14)] bg-transparent p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="seclabel b"><CaduceusMark /> The Grimoire</h3>
                  <span className="font-mono text-[11px] tracking-[0.06em] uppercase text-[#6e6e6e]">
                    <span className="text-[#ededed] font-medium">{agents?.length ?? 0}</span> skills
                  </span>
                </div>
                <div className="space-y-2">
                  {(agents ?? []).slice(0, 5).map((agent) => (
                    <div key={agent.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{agent.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{agent.status}</span>
                    </div>
                  ))}
                  {(!agents || agents.length === 0) && (
                    <div className="text-xs text-muted-foreground">No agents configured</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Archangel Cost Attribution ──────────────────────────── */}
          <ArchangelCost byAgent={costByAgent ?? []} />

          {/* ── The Mechanism: Magnum Opus + Solve et Coagula + Eighth Sphere
                + Hermes' Errands + Ouroboros — five small Hermetic telemetry cards ── */}
          <HermeticPanelsRow
            sunoIssues={sunoIssues ?? null}
            activity={activity ?? null}
            runs={(runs as any) ?? null}
          />

          {/* ── Archangel Org Chart — right under Magnum Opus ────────── */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <ArchangelOrgChart agentsRunning={agentsRunning} />
            </div>
            <div>
              <AgentActivityFeed agents={agents} runs={runs as any} />
            </div>
          </div>

          {/* ── The Celestial Mechanism: Planetary Hour + Heptachord + Monochord ── */}
          <MechanismRow sunoIssues={sunoIssues ?? null} />

          {/* ── The Telemetry: Aspect Grid + Kerykeion live message graph ── */}
          <TelemetryRow
            activity={activity ?? null}
            agentIdToName={
              new Map((agents ?? []).map((a) => [a.id, a.name]))
            }
          />

          {/* ── Songs Metrics · Frequency Distribution ─────────────── */}
          <SongsMetricsPanel companyId={selectedCompanyId!} />

          {/* ── 4. Recent Tasks ───────────────────────────────────────── */}
          <div className="min-w-0">
            <h3 className="seclabel r mb-3">
              <CaduceusMark /> RECENT TASKS
            </h3>
            {recentIssues.length === 0 ? (
              <div className="border border-border p-4">
                <p className="text-sm text-muted-foreground">No tasks yet.</p>
              </div>
            ) : (
              <div className="border border-border divide-y divide-border overflow-hidden">
                {recentIssues.slice(0, 10).map((issue) => (
                  <Link
                    key={issue.id}
                    to={`/issues/${issue.identifier ?? issue.id}`}
                    className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                  >
                    <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                      {/* Status icon - left column on mobile */}
                      <span className="shrink-0 sm:hidden">
                        <StatusIcon status={issue.status} />
                      </span>

                      {/* Right column on mobile: title + metadata stacked */}
                      <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                        <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                          {issue.title}
                        </span>
                        <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                          <span className="hidden sm:inline-flex"><PriorityIcon priority={issue.priority} /></span>
                          <span className="hidden sm:inline-flex"><StatusIcon status={issue.status} /></span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {issue.identifier ?? issue.id.slice(0, 8)}
                          </span>
                          {issue.assigneeAgentId && (() => {
                            const name = agentName(issue.assigneeAgentId);
                            return name
                              ? <span className="hidden sm:inline-flex"><Identity name={name} size="sm" /></span>
                              : null;
                          })()}
                          <span className="text-xs text-muted-foreground sm:hidden">&middot;</span>
                          <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                            {timeAgo(issue.updatedAt)}
                          </span>
                        </span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Hermes Voice Orb — floating, bottom-right ── */}
      <HermesVoice preset="narration" className="fixed bottom-6 right-6 z-50" />
    </div>
  );
}

/**
 * Songs Metrics + Brainwave Tuning + Songs-by-Chakra panel.
 * Pulls live suno_issues, derives:
 *   - total tracks + estimated minutes
 *   - brainwave-band distribution from chakra mapping
 *     (Delta < Crown/Sleep, Theta < Third Eye / Deep work, Alpha < Heart,
 *      Beta < Solar/Mars/Drive)
 *   - songs by chakra (root → crown)
 *   - top genres bar chart
 */
function SongsMetricsPanel({ companyId }: { companyId: string }) {
  const { data: songs } = useQuery({
    queryKey: ["dashboard-suno", companyId],
    queryFn: () => sunoPipelineApi.list(companyId),
    refetchInterval: 60_000,
  });

  const metrics = useMemo(() => {
    const list = songs ?? [];
    const totalTracks = list.length;
    const totalMinutes = totalTracks * 3.5;

    // Chakra → brainwave band mapping
    const bandFor: Record<string, "delta" | "theta" | "alpha" | "beta"> = {
      CROWN: "delta",
      THIRD_EYE: "theta",
      THROAT: "alpha",
      HEART: "alpha",
      SOLAR: "beta",
      SACRAL: "beta",
      ROOT: "beta",
    };
    const bands = { delta: 0, theta: 0, alpha: 0, beta: 0 };
    const chakraCounts: Record<string, number> = {
      ROOT: 0, SACRAL: 0, SOLAR: 0, HEART: 0,
      THROAT: 0, THIRD_EYE: 0, CROWN: 0,
    };
    const genreCounts: Record<string, number> = {};

    for (const s of list) {
      const c = s.targetChakra ?? "";
      if (c in chakraCounts) chakraCounts[c] += 1;
      const band = bandFor[c];
      if (band) bands[band] += 1;
      const g = (s.genre ?? "").trim();
      if (g) {
        // Take the first comma-separated tag as the canonical genre
        const head = g.split(",")[0]?.trim().toLowerCase() ?? "";
        if (head) genreCounts[head] = (genreCounts[head] ?? 0) + 1;
      }
    }
    const total = totalTracks || 1;
    const bandPct = {
      delta: Math.round((bands.delta / total) * 100),
      theta: Math.round((bands.theta / total) * 100),
      alpha: Math.round((bands.alpha / total) * 100),
      beta: Math.round((bands.beta / total) * 100),
    };
    const deepFocusPct = bandPct.theta;

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalTracks,
      totalMinutes,
      bandPct,
      deepFocusPct,
      chakraCounts,
      topGenres,
    };
  }, [songs]);

  const CHAKRA_COLORS: Record<string, string> = {
    ROOT: "#ef4444",
    SACRAL: "#f97316",
    SOLAR: "#eab308",
    HEART: "#22c55e",
    THROAT: "#06b6d4",
    THIRD_EYE: "#6366f1",
    CROWN: "#a855f7",
  };

  const hours = Math.floor(metrics.totalMinutes / 60);
  const mins = Math.round(metrics.totalMinutes % 60);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Songs Metrics + Brainwave Tuning — left, 2 cols */}
      <div
        className="lg:col-span-2 rounded-xl border p-5 space-y-4"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Harmonic Telemetry
          </h3>
          <span
            className="font-mono text-[11px] tabular-nums tracking-wider"
            style={{ color: "#a3a3a3" }}
          >
            {metrics.totalTracks.toLocaleString()} tracks
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 items-end">
          <div>
            <div
              className="text-4xl font-bold tabular-nums"
              style={{ color: "#fff" }}
            >
              {metrics.deepFocusPct}
              <span className="text-lg" style={{ color: "#6a6a6a" }}>%</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Deep Focus · 7D
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-2xl font-semibold tabular-nums"
              style={{ color: "#c084fc" }}
            >
              {hours}<span className="text-base text-muted-foreground">h</span>{" "}
              {mins}<span className="text-base text-muted-foreground">m</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Listened
            </div>
          </div>
        </div>

        {/* Brainwave band cards */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <BrainwaveBand
            symbol="θ"
            name="Theta"
            range="4–8 Hz"
            pct={metrics.bandPct.theta}
            label="Deep Work · Primary"
            color="#22c55e"
          />
          <BrainwaveBand
            symbol="α"
            name="Alpha"
            range="8–12 Hz"
            pct={metrics.bandPct.alpha}
            label="Calm Review"
            color="#06b6d4"
          />
          <BrainwaveBand
            symbol="β"
            name="Beta"
            range="13–30 Hz"
            pct={metrics.bandPct.beta}
            label="Sprints · Drive"
            color="#fff"
          />
          <BrainwaveBand
            symbol="Δ"
            name="Delta"
            range="0.5–4 Hz"
            pct={metrics.bandPct.delta}
            label="Sleep · Recovery"
            color="#3b82f6"
          />
        </div>

        {/* Top genres */}
        {metrics.topGenres.length > 0 && (
          <div className="pt-3 border-t border-border/30 space-y-2">
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Modes
            </h4>
            {metrics.topGenres.map(([genre, count]) => {
              const pct = Math.round(
                (count / Math.max(1, metrics.totalTracks)) * 100,
              );
              return (
                <div key={genre} className="flex items-center gap-3 text-sm">
                  <span className="w-44 truncate text-foreground/90">
                    {genre}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #a855f7, #c084fc)",
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-16 text-right">
                    {count} tracks
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Songs by Chakra — right, 1 col */}
      <div
        className="rounded-xl border p-5 space-y-3"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Songs · By Chakra Root
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {Object.values(metrics.chakraCounts).filter((v) => v > 0).length}/7 lit
          </span>
        </div>
        <div className="space-y-2">
          {(Object.entries(metrics.chakraCounts) as Array<[string, number]>).map(
            ([chakra, count]) => {
              const max = Math.max(1, ...Object.values(metrics.chakraCounts));
              const pct = (count / max) * 100;
              const color = CHAKRA_COLORS[chakra] ?? "#999";
              const hz = SUNO_CHAKRA_FREQUENCIES[chakra as keyof typeof SUNO_CHAKRA_FREQUENCIES];
              return (
                <div key={chakra} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2">
                      <span
                        style={{
                          display: "inline-block",
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: color,
                        }}
                      />
                      <span className="font-mono uppercase tracking-wider text-muted-foreground">
                        {chakra.replace("_", " ")}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {hz}Hz
                      </span>
                    </span>
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: count === 0 ? "#ef4444" : "#fff" }}
                    >
                      {count}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: color,
                        opacity: count === 0 ? 0.15 : 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}

function BrainwaveBand({
  symbol,
  name,
  range,
  pct,
  label,
  color,
}: {
  symbol: string;
  name: string;
  range: string;
  pct: number;
  label: string;
  color: string;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        <span style={{ color }} className="font-mono mr-1">
          {symbol}
        </span>
        {name} · {range}
      </div>
      <div
        className="text-2xl font-bold tabular-nums mt-1"
        style={{ color }}
      >
        {pct}%
      </div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
        {label}
      </div>
      {/* mini sine wave hint */}
      <svg viewBox="0 0 100 12" className="w-full h-3 mt-2" preserveAspectRatio="none">
        <path
          d="M0,6 Q12.5,1 25,6 T50,6 T75,6 T100,6"
          stroke={color}
          strokeWidth="1"
          fill="none"
          opacity={pct > 0 ? 0.7 : 0.15}
        />
      </svg>
    </div>
  );
}
