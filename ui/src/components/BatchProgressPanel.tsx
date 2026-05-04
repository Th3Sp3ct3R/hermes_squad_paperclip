/**
 * BatchProgressPanel — shows per-batch progress for day-plan and bulk batches.
 * Polls every 5s via TanStack Query. Each batch card shows a progress bar,
 * counts, and an "Execute" button to fire pending tracks through MiniMax.
 *
 * Aesthetic: Albedo register (dark bg, silver borders, white glow).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Loader2 } from "lucide-react";
import { sunoPipelineApi, type BatchSummary } from "@/api/sunoPipeline";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

interface BatchProgressPanelProps {
  companyId: string;
}

export function BatchProgressPanel({ companyId }: BatchProgressPanelProps) {
  const { data: batches, isLoading } = useQuery({
    queryKey: ["suno-batches", companyId],
    queryFn: () => sunoPipelineApi.batches(companyId),
    refetchInterval: 5000,
    enabled: !!companyId,
  });

  if (isLoading || !batches || batches.length === 0) return null;

  const totalTracks = batches.reduce((s, b) => s + b.total, 0);
  const totalReady = batches.reduce((s, b) => s + b.ready, 0);
  const totalPending = batches.reduce((s, b) => s + b.pending, 0);
  const totalFailed = batches.reduce((s, b) => s + b.failed, 0);

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div
        className="flex items-center justify-between rounded-lg border px-4 py-2.5"
        style={{
          backgroundColor: "rgba(10,10,10,0.8)",
          borderColor: "rgba(192,192,192,0.2)",
        }}
      >
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-semibold tracking-tight"
            style={{
              color: "#FFFFFF",
              textShadow: "0 0 6px rgba(255,255,255,0.4)",
            }}
          >
            Batch Pipeline
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {batches.length} batch{batches.length !== 1 && "es"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums">
          <span style={{ color: "#4ade80" }}>{totalReady} ready</span>
          <span style={{ color: "#C0C0C0" }}>{totalPending} pending</span>
          {totalFailed > 0 && (
            <span style={{ color: "#f87171" }}>{totalFailed} failed</span>
          )}
          <span className="text-muted-foreground">{totalTracks} total</span>
        </div>
      </div>

      {/* Per-batch cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {batches.map((batch) => (
          <BatchCard key={batch.batchId} batch={batch} companyId={companyId} />
        ))}
      </div>
    </div>
  );
}

function BatchCard({
  batch,
  companyId,
}: {
  batch: BatchSummary;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const executeMutation = useMutation({
    mutationFn: () =>
      sunoPipelineApi.executeBatch(batch.batchId, companyId, {
        musicBackend: "minimax",
        concurrency: 5,
      }),
    onSuccess: (result) => {
      pushToast({
        tone: "success",
        title: "Batch executing",
        body: result.message,
        ttlMs: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ["suno-batches", companyId] });
    },
    onError: (err) => {
      pushToast({
        tone: "error",
        title: "Batch execute failed",
        body: err instanceof Error ? err.message : "Unknown error",
        ttlMs: 5000,
      });
    },
  });

  const pct = batch.total > 0 ? Math.round((batch.ready / batch.total) * 100) : 0;
  const allDone = batch.pending === 0 && batch.failed === 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors",
        allDone && "opacity-60",
      )}
      style={{
        backgroundColor: "rgba(10,10,10,0.7)",
        borderColor: allDone
          ? "rgba(74,222,128,0.25)"
          : "rgba(192,192,192,0.15)",
      }}
    >
      {/* Title + chakra */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-medium leading-snug line-clamp-2"
            style={{ color: "#E0E0E0" }}
          >
            {batch.masterConcept || batch.batchRequest || batch.batchId}
          </p>
        </div>
        {batch.targetChakra && (
          <span
            className="shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-wider font-medium"
            style={{
              borderColor: "rgba(192,192,192,0.3)",
              color: "#C0C0C0",
            }}
          >
            {batch.targetChakra}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div
          className="h-1.5 w-full rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(192,192,192,0.1)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: allDone ? "#4ade80" : "#FFFFFF",
              boxShadow: allDone
                ? "0 0 6px rgba(74,222,128,0.5)"
                : "0 0 6px rgba(255,255,255,0.4)",
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums">
          <span style={{ color: "#C0C0C0" }}>
            {batch.ready}/{batch.total} ready
          </span>
          <div className="flex gap-2">
            {batch.pending > 0 && (
              <span className="text-muted-foreground">
                {batch.pending} pending
              </span>
            )}
            {batch.failed > 0 && (
              <span style={{ color: "#f87171" }}>{batch.failed} failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Execute button — only show when there are pending tracks */}
      {batch.pending > 0 && (
        <Button
          size="sm"
          disabled={executeMutation.isPending}
          onClick={() => executeMutation.mutate()}
          className="w-full h-7 text-xs"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(192,192,192,0.3)",
            color: "#FFFFFF",
          }}
          variant="outline"
        >
          {executeMutation.isPending ? (
            <>
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="h-3 w-3 mr-1.5" />
              Execute ({batch.pending} tracks)
            </>
          )}
        </Button>
      )}
    </div>
  );
}
