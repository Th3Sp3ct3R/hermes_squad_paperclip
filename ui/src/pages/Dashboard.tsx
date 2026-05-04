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
import { PageSkeleton } from "../components/PageSkeleton";
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
        "font-semibold text-center leading-tight",
        size === "xl" ? "text-base" : "text-sm",
      )}>
        {agent.name}
      </span>
      <span className={cn(
        "text-muted-foreground text-center leading-tight",
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
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
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
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        Agent Activity
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

function UsageSparkline({ byDay }: { byDay: { date: string; tokens: number; calls: number }[] }) {
  const maxTokens = Math.max(...byDay.map((d) => d.tokens), 1);
  const width = byDay.length * 10;
  const points = byDay
    .map((d, i) => `${i * 10},${100 - (d.tokens / maxTokens) * 90}`)
    .join(" ");
  const areaPoints = `0,100 ${points} ${(byDay.length - 1) * 10},100`;

  return (
    <div className="h-32 w-full">
      <svg
        viewBox={`0 0 ${width} 100`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <polygon
          fill="currentColor"
          className="text-primary/10"
          points={areaPoints}
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-primary"
          points={points}
        />
      </svg>
      <div className="flex justify-between mt-1 text-[9px] text-muted-foreground">
        <span>{byDay[0]?.date?.slice(5)}</span>
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
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
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

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

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
          {/* ── 1. Archangel Org Chart + Live Activity ───────────────── */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <ArchangelOrgChart agentsRunning={agentsRunning} />
            </div>
            <div>
              <AgentActivityFeed agents={agents} runs={runs as any} />
            </div>
          </div>

          {/* ── 2. Stats Row ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="rounded-lg border border-border/40 bg-card/50 px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Sessions</span>
              <div className="text-2xl font-bold tabular-nums">{data.tasks.inProgress + data.tasks.open}</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-card/50 px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tokens Used</span>
              <div className="text-2xl font-bold tabular-nums">{formatNumber(usageStats?.totalTokens ?? 0)}</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-card/50 px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">API Calls</span>
              <div className="text-2xl font-bold tabular-nums">{usageStats?.totalCalls ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border/40 bg-card/50 px-4 py-3">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Active Model</span>
              <div className="mt-1">
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {usageStats?.byModel?.[0]?.model ?? "minimax/minimax-m2.5:free"}
                </span>
              </div>
            </div>
          </div>

          {/* ── 3. Usage Trend + Top Models ──────────────────────────── */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Usage Trend — 2/3 width */}
            <div className="md:col-span-2 rounded-lg border border-border/40 bg-card/30 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Usage Trend · 30D</h3>
                <div className="flex gap-1">
                  {["7D", "14D", "30D"].map(p => (
                    <button key={p} className={cn("px-2 py-0.5 text-[10px] rounded", p === "30D" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {usageStats && usageStats.byDay.length > 0 ? (
                <UsageSparkline byDay={usageStats.byDay} />
              ) : (
                <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                  No usage data yet
                </div>
              )}
            </div>

            {/* Top Models — 1/3 width */}
            <div className="rounded-lg border border-border/40 bg-card/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Top Models</h3>
              <div className="space-y-2">
                {usageStats && usageStats.byModel.length > 0 ? (
                  usageStats.byModel.slice(0, 5).map((m) => (
                    <div key={m.model} className="flex justify-between text-sm">
                      <span className="truncate mr-2">{m.model}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">{m.calls} calls</span>
                    </div>
                  ))
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
          </div>

          {/* ── Hermes: Sessions Intelligence + Skills ────────────────── */}
          <div className="grid md:grid-cols-3 gap-4">
            {/* Sessions Intelligence — 2/3 width */}
            <div className="md:col-span-2">
              <div className="rounded-xl border border-border/30 bg-card/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Sessions Intelligence
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {recentActivity.length} RECENT
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
            <div className="space-y-4">
              {/* Cache Efficiency */}
              <div className="rounded-xl border border-border/30 bg-card/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cache Efficiency</h3>
                  <span className="text-[10px] text-muted-foreground">30D</span>
                </div>
                {usageStats && usageStats.totalCalls > 0 ? (
                  <>
                    <div className="text-3xl font-bold tabular-nums">{usageStats.cacheHitRate}%</div>
                    <span className="text-xs text-muted-foreground">prompt token cache hit rate</span>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-bold tabular-nums">&mdash;</div>
                    <span className="text-xs text-muted-foreground">No cache data yet</span>
                  </>
                )}
              </div>

              {/* Agent Skills */}
              <div className="rounded-xl border border-border/30 bg-card/30 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Agent Skills</h3>
                  <span className="text-[10px] text-muted-foreground">
                    {agents?.length ?? 0} AGENTS
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

          {/* ── 4. Recent Tasks ───────────────────────────────────────── */}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Recent Tasks
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
    </div>
  );
}
