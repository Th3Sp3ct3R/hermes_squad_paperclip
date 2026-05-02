/**
 * SunoPipeline — Kanban board for the autonomous music production pipeline.
 *
 * Stages (from the DB `status` column):
 *   DRAFT      — concept exists, no generation started
 *   GENERATING — Uriel/Zadkiel/Jophiel/Raziel are working on it
 *   REVIEW     — Raphael is gating
 *   APPROVED   — passed review, awaiting publish
 *   PUBLISHED  — Sandalphon shipped it
 *   FAILED     — terminal failure
 *
 * The page reads from /api/suno-pipeline (TanStack Query) and writes via
 * the same client. Mutations go through the standard activity-log pipeline.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music, Plus, X } from "lucide-react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChakraFrequencyMap } from "@/components/ChakraFrequencyMap";
import { cn } from "@/lib/utils";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import {
  sunoPipelineApi,
  SUNO_BOARD_COLUMNS,
  SUNO_CHAKRAS,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoChakra,
  type SunoIssue,
  type SunoStatus,
} from "@/api/sunoPipeline";
import type { Agent } from "@paperclipai/shared";

const STATUS_LABEL: Record<SunoStatus, string> = {
  DRAFT: "Concept",
  GENERATING: "Generating",
  REVIEW: "Review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

const sunoQueryKey = (companyId: string) => ["suno-pipeline", companyId] as const;

export function SunoPipeline() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [conceptDraft, setConceptDraft] = useState("");
  const [chakraDraft, setChakraDraft] = useState<SunoChakra>("HEART");
  const [genreDraft, setGenreDraft] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Suno Pipeline" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: sunoQueryKey(selectedCompanyId ?? "_"),
    queryFn: () => sunoPipelineApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "_"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents ?? []) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return sunoPipelineApi.create(selectedCompanyId, {
        concept: conceptDraft.trim(),
        targetChakra: chakraDraft,
        genre: genreDraft.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sunoQueryKey(selectedCompanyId ?? "_"),
      });
      setConceptDraft("");
      setGenreDraft("");
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SunoStatus }) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return sunoPipelineApi.update(id, selectedCompanyId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sunoQueryKey(selectedCompanyId ?? "_"),
      });
    },
  });

  const grouped = useMemo(() => {
    const buckets: Record<SunoStatus, SunoIssue[]> = {
      DRAFT: [],
      GENERATING: [],
      REVIEW: [],
      APPROVED: [],
      PUBLISHED: [],
      FAILED: [],
    };
    for (const issue of issues ?? []) {
      if (issue.status in buckets) buckets[issue.status].push(issue);
    }
    return buckets;
  }, [issues]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view its Suno pipeline.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">Suno Pipeline</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous music production board. Concepts move from draft through
            generation, review, and release.
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} size="sm">
          {showCreate ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {showCreate ? "Cancel" : "New Concept"}
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6 space-y-1.5">
              <Label htmlFor="suno-concept">Concept</Label>
              <Input
                id="suno-concept"
                placeholder="e.g. midnight elevator descent, vaporwave decay…"
                value={conceptDraft}
                onChange={(e) => setConceptDraft(e.target.value)}
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <Label htmlFor="suno-chakra">Target chakra</Label>
              <Select
                value={chakraDraft}
                onValueChange={(v) => setChakraDraft(v as SunoChakra)}
              >
                <SelectTrigger id="suno-chakra">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUNO_CHAKRAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} · {SUNO_CHAKRA_FREQUENCIES[c]} Hz
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="suno-genre">Genre</Label>
              <Input
                id="suno-genre"
                placeholder="ambient, dark hip-hop…"
                value={genreDraft}
                onChange={(e) => setGenreDraft(e.target.value)}
              />
            </div>
            <div className="md:col-span-1">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!conceptDraft.trim() || createMutation.isPending}
                className="w-full"
                size="sm"
              >
                {createMutation.isPending ? "…" : "Create"}
              </Button>
            </div>
          </div>
          {createMutation.error && (
            <p className="text-xs text-destructive mt-2">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create"}
            </p>
          )}
        </Card>
      )}

      <ChakraFrequencyMap issues={issues ?? []} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading pipeline…</div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load pipeline"}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {SUNO_BOARD_COLUMNS.map((status) => (
            <SunoColumn
              key={status}
              status={status}
              issues={grouped[status]}
              agentNameById={agentNameById}
              onChangeStatus={(id, next) =>
                updateMutation.mutate({ id, status: next })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SunoColumnProps {
  status: SunoStatus;
  issues: SunoIssue[];
  agentNameById: Map<string, string>;
  onChangeStatus: (id: string, next: SunoStatus) => void;
}

function SunoColumn({ status, issues, agentNameById, onChangeStatus }: SunoColumnProps) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between px-2 py-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {STATUS_LABEL[status]}
        </span>
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {issues.length}
        </span>
      </div>
      <div
        className={cn(
          "flex-1 min-h-[120px] rounded-md p-1.5 space-y-1.5 bg-muted/20",
          status === "FAILED" && "bg-destructive/10",
        )}
      >
        {issues.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/50 text-center py-4">
            empty
          </div>
        ) : (
          issues.map((issue) => (
            <SunoCard
              key={issue.id}
              issue={issue}
              agentNameById={agentNameById}
              onChangeStatus={onChangeStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SunoCardProps {
  issue: SunoIssue;
  agentNameById: Map<string, string>;
  onChangeStatus: (id: string, next: SunoStatus) => void;
}

function SunoCard({ issue, agentNameById, onChangeStatus }: SunoCardProps) {
  const assigned = [
    issue.lyricsAgentId && agentNameById.get(issue.lyricsAgentId),
    issue.soundAgentId && agentNameById.get(issue.soundAgentId),
    issue.visualAgentId && agentNameById.get(issue.visualAgentId),
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-md border bg-card p-2.5 space-y-1.5 hover:shadow-sm transition-shadow">
      {/* Cover art (when available) — Suno auto-generates this; Jophiel can override */}
      {issue.thumbnailUrl && (
        <div className="relative -m-2.5 mb-1.5 aspect-square w-[calc(100%+1.25rem)] overflow-hidden rounded-t-md">
          <img
            src={issue.thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          {issue.audioUrl && (
            <span
              aria-label="audio attached"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white backdrop-blur-sm"
            >
              ♪ audio
            </span>
          )}
        </div>
      )}
      <div className="text-[13px] leading-snug font-medium line-clamp-2">
        {issue.concept}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide rounded-sm border px-1.5 py-0.5 bg-muted/40">
          {issue.targetChakra} · {issue.targetFrequency}Hz
        </span>
        {issue.genre && (
          <span className="text-[10px] text-muted-foreground italic">
            {issue.genre}
          </span>
        )}
      </div>
      {assigned.length > 0 && (
        <div className="text-[11px] text-muted-foreground truncate">
          {assigned.join(" · ")}
        </div>
      )}
      {/* Inline audio player when audioUrl is set — quick preview without leaving the kanban */}
      {issue.audioUrl && (
        <audio
          src={issue.audioUrl}
          controls
          preload="none"
          className="h-7 w-full"
          style={{ colorScheme: "dark" }}
        />
      )}
      <Select
        value={issue.status}
        onValueChange={(v) => onChangeStatus(issue.id, v as SunoStatus)}
      >
        <SelectTrigger className="h-6 text-[11px] py-0 px-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUNO_BOARD_COLUMNS.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
