/**
 * ArchangelHeatmap — at-a-glance workload view of the 10 archangel agents.
 *
 * Each tile shows the archangel's name, current status, and a count of
 * Suno pipeline issues where they are the lyrics / sound / visual lead.
 *
 * The heatmap is "tone over text": idle = muted, busy = warm tone, error =
 * destructive tone. Click-through goes to the agent detail page.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { agentsApi } from "@/api/agents";
import { sunoPipelineApi } from "@/api/sunoPipeline";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { ArchangelAvatar } from "./ArchangelAvatar";
import { type ArchangelName } from "./SacredGeometry";

const ARCHANGEL_ORDER: ArchangelName[] = [
  "Michael",
  "Raphael",
  "Gabriel",
  "Metatron",
  "Uriel",
  "Jophiel",
  "Zadkiel",
  "Raziel",
  "Sandalphon",
  "Cassiel",
];

interface ArchangelHeatmapProps {
  companyId: string;
}

export function ArchangelHeatmap({ companyId }: ArchangelHeatmapProps) {
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: sunoIssues } = useQuery({
    queryKey: ["suno-pipeline", companyId] as const,
    queryFn: () => sunoPipelineApi.list(companyId),
    enabled: !!companyId,
  });

  const archangelRows = useMemo(() => {
    if (!agents) return [];
    const byName = new Map(agents.map((a) => [a.name, a]));
    return ARCHANGEL_ORDER.map((name) => byName.get(name) ?? null);
  }, [agents]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const issue of sunoIssues ?? []) {
      for (const agentId of [
        issue.lyricsAgentId,
        issue.soundAgentId,
        issue.visualAgentId,
      ]) {
        if (!agentId) continue;
        // Don't count terminal states against current workload.
        if (issue.status === "PUBLISHED" || issue.status === "FAILED") continue;
        counts.set(agentId, (counts.get(agentId) ?? 0) + 1);
      }
    }
    return counts;
  }, [sunoIssues]);

  // Hide the panel entirely if not a single archangel exists yet — keeps the
  // dashboard clean for companies that haven't run the seed.
  const presentCount = archangelRows.filter((a) => a !== null).length;
  if (presentCount === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Archangel Workload</h3>
        <span className="text-xs text-muted-foreground">
          {presentCount}/10 archangels seeded
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
        {ARCHANGEL_ORDER.map((name, i) => {
          const agent = archangelRows[i];
          const count = agent ? taskCounts.get(agent.id) ?? 0 : 0;
          const status = agent?.status ?? "missing";
          const tone = toneFor(status, count);
          const tile = (
            <div
              className={cn(
                "rounded-md border p-2 transition-colors",
                tone,
                !agent && "opacity-40",
              )}
              data-archangel={name}
              data-task-count={count}
              data-status={status}
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                <ArchangelAvatar
                  name={name}
                  size="md"
                  working={count > 0}
                  geometryOnly={!agent}
                />
                <span className="text-[11px] font-medium truncate w-full">{name}</span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {agent ? agent.status : "—"}
                </span>
                <span className="text-sm font-semibold tabular-nums">{count}</span>
              </div>
            </div>
          );
          if (agent) {
            return (
              <Link key={name} to={`/agents/${agent.id}`} className="no-underline text-inherit">
                {tile}
              </Link>
            );
          }
          return <div key={name}>{tile}</div>;
        })}
      </div>
    </div>
  );
}

function toneFor(status: string, count: number): string {
  if (status === "missing") return "bg-muted/20 text-muted-foreground border-border";
  if (status === "error") return "bg-destructive/15 text-destructive border-destructive/30";
  if (status === "paused") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  if (count >= 3) return "bg-orange-500/20 text-orange-200 border-orange-500/30";
  if (count >= 1) return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
  return "bg-muted/30 text-muted-foreground border-border";
}
