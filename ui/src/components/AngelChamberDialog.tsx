/**
 * Angel Chamber — the ritual modal that replaces the bare "Begin Opus"
 * form. Hermes (the host angel) asks the user about their day, parses
 * their answer into a day-plan with chakra/frequency per block, presents
 * the plan with the ruling angel for each block, and on confirm fires
 * one Suno batch per block.
 *
 * Three steps:
 *   1. INTRO — Hermes greets, asks what they're composing today
 *   2. PLAN  — Hermes returns the parsed day plan with per-block angels
 *   3. DONE  — batches dispatched, dayPlanId returned
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "../api/client";

type Step = "INTRO" | "PARSING" | "PLAN" | "DISPATCHING" | "DONE";

interface RulingAngel {
  name: string;
  glyph: string;
  voice: string;
}

interface DayPlanBlock {
  label: string;
  durationMinutes: number;
  targetChakra: string;
  targetFrequency: number;
  genre: string;
  masterSoundPrompt: string;
  rationale: string;
  rulingAngel: RulingAngel;
}

interface DayPlan {
  request: string;
  totalDurationMinutes: number;
  hostGreeting: string;
  hostSummary: string;
  blocks: DayPlanBlock[];
}

interface DispatchResult {
  dayPlanId: string;
  totalDurationMinutes: number;
  blockCount: number;
  totalSongs: number;
  batches: Array<{
    batchId: string;
    blockLabel: string;
    chakra: string;
    durationMinutes: number;
    songCount: number;
    firstIssueId: string;
  }>;
}

interface AngelChamberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Called after dispatch succeeds so the caller can refetch the kanban. */
  onDispatched?: () => void;
}

const ALBEDO = {
  black: "#000000",
  white: "#FFFFFF",
  silver: "#C0C0C0",
  yellow: "#FFD700",
  red: "#DC143C",
};

const HERMES_GLYPH = "⚕";

export function AngelChamberDialog({
  open,
  onOpenChange,
  companyId,
  onDispatched,
}: AngelChamberDialogProps) {
  const [step, setStep] = useState<Step>("INTRO");
  const [tasks, setTasks] = useState("");
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);

  const parseMutation = useMutation({
    mutationFn: async (request: string) => {
      const r = await api.post<DayPlan>("/suno-pipeline/day-plan/parse", {
        companyId,
        request,
      });
      return r;
    },
    onMutate: () => setStep("PARSING"),
    onSuccess: (p) => {
      setPlan(p);
      setStep("PLAN");
    },
    onError: () => setStep("INTRO"),
  });

  const dispatchMutation = useMutation({
    mutationFn: async (confirmedPlan: DayPlan) => {
      const r = await api.post<DispatchResult>(
        "/suno-pipeline/day-plan/create",
        { companyId, plan: confirmedPlan },
      );
      return r;
    },
    onMutate: () => setStep("DISPATCHING"),
    onSuccess: (r) => {
      setResult(r);
      setStep("DONE");
      onDispatched?.();
    },
    onError: () => setStep("PLAN"),
  });

  const reset = () => {
    setStep("INTRO");
    setTasks("");
    setPlan(null);
    setResult(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-2xl"
        style={{
          backgroundColor: "#0a0a0a",
          borderColor: "#1a1a1a",
          boxShadow:
            "inset 0 0 80px rgba(192,192,192,0.05), 0 0 60px rgba(192,192,192,0.12)",
        }}
      >
        {/* Step 1: Hermes greets */}
        {step === "INTRO" && (
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3">
              <span
                className="text-4xl shrink-0"
                style={{
                  color: ALBEDO.white,
                  textShadow:
                    "0 0 8px rgba(255,255,255,0.9), 0 0 18px rgba(192,192,192,0.5)",
                }}
              >
                {HERMES_GLYPH}
              </span>
              <div>
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  Hermes enters the chamber
                </p>
                <p
                  className="text-lg italic mt-1.5"
                  style={{
                    color: ALBEDO.white,
                    textShadow: "0 0 6px rgba(255,255,255,0.4)",
                  }}
                >
                  Tell me what you're doing today, and I will prescribe the
                  frequencies. Speak the working — focus, force, repose. I will
                  read between the lines.
                </p>
              </div>
            </div>
            <textarea
              value={tasks}
              onChange={(e) => setTasks(e.target.value)}
              placeholder="e.g.  Deep work on the API, 8am–noon. Workout 12–1. Calls with the design team 2–4. Wind down 6–7. Sleep at 11."
              rows={6}
              className="w-full rounded-md border bg-transparent p-3 text-sm focus:outline-none focus:ring-1"
              style={{
                color: ALBEDO.white,
                borderColor: ALBEDO.silver,
                boxShadow: "inset 0 0 16px rgba(192,192,192,0.06)",
              }}
            />
            {parseMutation.error && (
              <p className="text-xs" style={{ color: ALBEDO.red }}>
                {(parseMutation.error as Error).message ||
                  "The chamber is silent. Try again."}
              </p>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[11px] italic" style={{ color: ALBEDO.silver }}>
                The angels are listening.
              </span>
              <Button
                onClick={() => parseMutation.mutate(tasks)}
                disabled={tasks.trim().length < 3 || parseMutation.isPending}
                style={{
                  backgroundColor: ALBEDO.white,
                  color: ALBEDO.black,
                  borderColor: ALBEDO.silver,
                  boxShadow: "0 0 12px rgba(255,255,255,0.3)",
                }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Speak
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: parsing animation */}
        {step === "PARSING" && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: ALBEDO.silver }}
            />
            <p
              className="text-sm italic"
              style={{
                color: ALBEDO.white,
                textShadow: "0 0 6px rgba(192,192,192,0.4)",
              }}
            >
              Hermes consults the council…
            </p>
          </div>
        )}

        {/* Step 3: plan presented */}
        {step === "PLAN" && plan && (
          <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto">
            <div className="flex items-start gap-3">
              <span
                className="text-3xl shrink-0"
                style={{
                  color: ALBEDO.white,
                  textShadow: "0 0 8px rgba(255,255,255,0.85)",
                }}
              >
                {HERMES_GLYPH}
              </span>
              <div>
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  Hermes presents the working
                </p>
                <p
                  className="text-base italic mt-1.5"
                  style={{
                    color: ALBEDO.white,
                    textShadow: "0 0 5px rgba(255,255,255,0.35)",
                  }}
                >
                  {plan.hostSummary}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {plan.blocks.map((b, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-3 space-y-1"
                  style={{
                    borderColor: "#1f1f1f",
                    backgroundColor: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xl"
                        style={{
                          color: ALBEDO.white,
                          textShadow: "0 0 6px rgba(255,255,255,0.6)",
                        }}
                      >
                        {b.rulingAngel.glyph}
                      </span>
                      <span
                        className="font-semibold text-sm"
                        style={{ color: ALBEDO.white }}
                      >
                        {b.label}
                      </span>
                    </div>
                    <span
                      className="text-[11px] tabular-nums"
                      style={{ color: ALBEDO.silver }}
                    >
                      {b.durationMinutes} min · {b.targetFrequency} Hz
                    </span>
                  </div>
                  <p
                    className="text-[11px] uppercase tracking-widest"
                    style={{ color: ALBEDO.silver }}
                  >
                    {b.targetChakra} · {b.rulingAngel.name} —{" "}
                    <span className="italic normal-case">{b.rulingAngel.voice}</span>
                  </p>
                  {b.rationale && (
                    <p
                      className="text-xs italic"
                      style={{ color: "rgba(255,255,255,0.7)" }}
                    >
                      "{b.rationale}"
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep("INTRO")}
                style={{ color: ALBEDO.silver }}
              >
                Reword
              </Button>
              <Button
                onClick={() => dispatchMutation.mutate(plan)}
                disabled={dispatchMutation.isPending}
                style={{
                  backgroundColor: ALBEDO.yellow,
                  color: ALBEDO.black,
                  borderColor: ALBEDO.silver,
                  boxShadow: "0 0 14px rgba(255,215,0,0.4)",
                }}
              >
                Begin the Working
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: dispatching */}
        {step === "DISPATCHING" && (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <Loader2
              className="h-8 w-8 animate-spin"
              style={{ color: ALBEDO.yellow }}
            />
            <p
              className="text-sm italic"
              style={{
                color: ALBEDO.white,
                textShadow: "0 0 6px rgba(255,215,0,0.5)",
              }}
            >
              The council is dispatched. The working has begun.
            </p>
          </div>
        )}

        {/* Step 5: done */}
        {step === "DONE" && result && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <span
                className="text-3xl shrink-0"
                style={{
                  color: ALBEDO.yellow,
                  textShadow:
                    "0 0 10px rgba(255,215,0,0.7), 0 0 20px rgba(255,215,0,0.35)",
                }}
              >
                {HERMES_GLYPH}
              </span>
              <div>
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  The working is underway
                </p>
                <p
                  className="text-base italic mt-1.5"
                  style={{ color: ALBEDO.white }}
                >
                  {result.totalSongs} tracks across {result.blockCount} blocks
                  ({result.totalDurationMinutes} minutes). Watch the kanban —
                  the angels are composing.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                style={{ color: ALBEDO.silver }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
