/**
 * AngelInvocationDialog — ritual chat modal for single-song creation.
 *
 * Clicking a chakra cell or mood preset opens this dialog with the ruling
 * angel for that frequency. The angel asks for "the materia" (user types
 * a concept), sends it to the LLM for refinement, presents the refined
 * working, and on confirm creates the issue + fires auto-run.
 *
 * 6-step state machine:
 *   ENTERING    — angel fades in with dramatic prompt
 *   MATERIA     — user types concept + optional genre
 *   REFINING    — LLM refines the concept via angel-refine endpoint
 *   SUMMARIZING — LLM-refined summary shown, confirm or reword
 *   DISPATCHING — create + auto-run in progress
 *   DISPATCHED  — confirmation shown
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ArchangelAvatar } from "@/components/ArchangelAvatar";
import {
  sunoPipelineApi,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoChakra,
  type AngelRefineResult,
} from "@/api/sunoPipeline";
import type { ArchangelName } from "@/components/SacredGeometry";

// ── Step machine ────────────────────────────────────────────────────────────

type InvocationStep = "ENTERING" | "MATERIA" | "REFINING" | "SUMMARIZING" | "DISPATCHING" | "DISPATCHED";

// ── Chakra -> Ruling Angel registry ─────────────────────────────────────────

interface RulingAngelDef {
  name: string;
  glyph: string;
  voice: string;
  materiaPrompt: string;
  /** Whether this angel has a portrait in ArchangelAvatar. */
  hasPortrait: boolean;
  /** Special void treatment for Da'ath / Throat. */
  isVoid?: boolean;
}

const RULING_ANGELS: Record<SunoChakra, RulingAngelDef> = {
  ROOT: {
    name: "Uriel",
    glyph: "\u26F0",
    voice: "Grounded, terse, earthbound",
    materiaPrompt:
      "Root frequency, 396 Hz. Liberation from fear and guilt. " +
      "This is where you ground \u2014 gym sessions, shadow integration, " +
      "returning to the body after living too long in the mind. " +
      "What needs anchoring?",
    hasPortrait: true,
  },
  SACRAL: {
    name: "Haniel",
    glyph: "\u2640",
    voice: "Sensual, flowing",
    materiaPrompt:
      "Sacral frequency, 417 Hz. The frequency of change \u2014 " +
      "undoing situations, dissolving what no longer serves. Best invoked " +
      "during night drives, transformation rituals, the liminal hours " +
      "between midnight and dawn. What transformation calls you?",
    hasPortrait: false,
  },
  SOLAR: {
    name: "Michael",
    glyph: "\u2609",
    voice: "Direct, fiery, commanding",
    materiaPrompt:
      "Solar frequency, 528 Hz. The miracle tone \u2014 clarity, repair, " +
      "return to natural order. This is your morning frequency. Walking through " +
      "cold air with purpose, first coffee with intention. What needs illumination?",
    hasPortrait: true,
  },
  HEART: {
    name: "Raphael",
    glyph: "\u2609",
    voice: "Healing, balanced, central",
    materiaPrompt:
      "Heart frequency, 639 Hz. Connection and harmony. Where creativity " +
      "flows easiest \u2014 golden hour coding, winding down in a clean kitchen, " +
      "the quiet confidence of unhurried mastery. Speak the materia \u2014 a mood, " +
      "a memory, a wound to mend.",
    hasPortrait: true,
  },
  THROAT: {
    name: "Da\u2019ath",
    glyph: "\u26A0",
    voice: "The Abyss. No angel rules here. Only the Crosser.",
    materiaPrompt:
      "Throat frequency, 741 Hz. Da\u2019ath \u2014 the Abyss between what is known " +
      "and what must be spoken. Expression, problem-solving, cleansing. Most powerful " +
      "during difficult conversations or when something must be said aloud. " +
      "What needs to be spoken into existence?",
    hasPortrait: false,
    isVoid: true,
  },
  THIRD_EYE: {
    name: "Tzaphkiel",
    glyph: "\u2644",
    voice: "Contemplative, slow, knowing",
    materiaPrompt:
      "Third Eye frequency, 852 Hz. The frequency of inner knowing. " +
      "Your architect register \u2014 deep coding sessions, system design at 3am, " +
      "the state where the code writes itself. I see what you cannot yet name. " +
      "Describe the vision.",
    hasPortrait: false,
  },
  CROWN: {
    name: "Metatron",
    glyph: "\u25EF",
    voice: "Scribe, omniscient, sparse",
    materiaPrompt:
      "Crown frequency, 963 Hz. The highest register \u2014 pineal activation, " +
      "the threshold between waking and dissolution. Reserved for sleep descent, " +
      "void states, and the moments before unconsciousness claims you. " +
      "What approaches the threshold of form?",
    hasPortrait: true,
  },
};

// ── Albedo palette (consistent with AngelChamberDialog) ─────────────────────

const ALBEDO = {
  black: "#000000",
  white: "#FFFFFF",
  silver: "#C0C0C0",
  yellow: "#FFD700",
  red: "#DC143C",
};

// ── Props ───────────────────────────────────────────────────────────────────

interface AngelInvocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  chakra: SunoChakra;
  preloadedConcept?: string;
  preloadedGenre?: string;
  onDispatched?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function AngelInvocationDialog({
  open,
  onOpenChange,
  companyId,
  chakra,
  preloadedConcept,
  preloadedGenre,
  onDispatched,
}: AngelInvocationDialogProps) {
  const [step, setStep] = useState<InvocationStep>("ENTERING");
  const [concept, setConcept] = useState("");
  const [genre, setGenre] = useState("");
  const [refined, setRefined] = useState<AngelRefineResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const enteringTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const createdIssueIdRef = useRef<string | null>(null);

  const angel = RULING_ANGELS[chakra];
  const hz = SUNO_CHAKRA_FREQUENCIES[chakra];

  // Reset state when dialog opens or chakra changes
  useEffect(() => {
    if (open) {
      setStep("ENTERING");
      setConcept(preloadedConcept ?? "");
      setGenre(preloadedGenre ?? "");
      setRefined(null);
      createdIssueIdRef.current = null;

      // Dramatic pause then transition to MATERIA
      enteringTimerRef.current = setTimeout(() => {
        setStep("MATERIA");
      }, 1500);
    }
    return () => {
      if (enteringTimerRef.current) clearTimeout(enteringTimerRef.current);
    };
  }, [open, chakra, preloadedConcept, preloadedGenre]);

  // Auto-focus textarea when entering MATERIA step
  useEffect(() => {
    if (step === "MATERIA") {
      const t = setTimeout(() => textareaRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [step]);

  // ── LLM refinement mutation ───────────────────────────────────────────────

  const refineMutation = useMutation({
    mutationFn: () =>
      sunoPipelineApi.angelRefine(companyId, {
        chakra,
        rulingAngel: angel.name,
        userInput: concept.trim(),
        presetConcept: preloadedConcept,
        presetGenre: preloadedGenre,
      }),
    onMutate: () => setStep("REFINING"),
    onSuccess: (result) => {
      setRefined(result);
      setStep("SUMMARIZING");
    },
    onError: () => {
      setStep("MATERIA");
    },
  });

  // ── Create + auto-run mutation ────────────────────────────────────────────

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const source = refined ?? {
        concept: concept.trim(),
        genre: genre.trim() || null,
        targetChakra: chakra,
      };
      // Only create if we haven't already (prevents duplicates on retry)
      if (!createdIssueIdRef.current) {
        const issue = await sunoPipelineApi.create(companyId, {
          concept: source.concept,
          targetChakra: refined?.targetChakra ?? chakra,
          genre: source.genre || null,
          metadata: {
            invocationSource: "angel-chamber",
            rulingAngel: angel.name,
            refinedByLlm: !!refined,
          },
        });
        createdIssueIdRef.current = issue.id;
      }
      // Fire auto-run
      const result = await sunoPipelineApi.autoRun(
        createdIssueIdRef.current,
        companyId,
        { musicBackend: "minimax" },
      );
      return result;
    },
    onMutate: () => setStep("DISPATCHING"),
    onSuccess: () => {
      setStep("DISPATCHED");
      onDispatched?.();
    },
    onError: () => setStep("SUMMARIZING"),
  });

  const reset = () => {
    setStep("ENTERING");
    setConcept("");
    setGenre("");
    setRefined(null);
    createdIssueIdRef.current = null;
    refineMutation.reset();
    dispatchMutation.reset();
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // ── Glyph-only avatar for angels without portraits ──────────────────────

  const GlyphAvatar = ({ size = 96 }: { size?: number }) => (
    <div
      className="flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: angel.isVoid
          ? "rgba(0,0,0,0.8)"
          : "rgba(192,192,192,0.08)",
        border: angel.isVoid
          ? "1px solid rgba(192,192,192,0.15)"
          : "1px solid rgba(192,192,192,0.25)",
        boxShadow: angel.isVoid
          ? "inset 0 0 40px rgba(0,0,0,0.9), 0 0 20px rgba(192,192,192,0.08)"
          : "0 0 20px rgba(192,192,192,0.15)",
      }}
    >
      <span
        style={{
          fontSize: size * 0.4,
          color: angel.isVoid ? ALBEDO.silver : ALBEDO.white,
          textShadow: angel.isVoid
            ? "0 0 8px rgba(192,192,192,0.4)"
            : "0 0 8px rgba(255,255,255,0.6)",
        }}
      >
        {angel.glyph}
      </span>
    </div>
  );

  const renderAvatar = (size: "lg" | "xl" = "lg") => {
    if (angel.hasPortrait && !angel.isVoid) {
      return (
        <ArchangelAvatar
          name={angel.name as ArchangelName}
          size={size}
          hoverable
        />
      );
    }
    return <GlyphAvatar size={size === "xl" ? 96 : 64} />;
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
        className="max-w-lg"
        style={{
          backgroundColor: angel.isVoid ? "#020202" : "#0a0a0a",
          borderColor: angel.isVoid ? "#0a0a0a" : "#1a1a1a",
          boxShadow: angel.isVoid
            ? "inset 0 0 100px rgba(0,0,0,0.95), 0 0 60px rgba(0,0,0,0.8)"
            : "inset 0 0 80px rgba(192,192,192,0.05), 0 0 60px rgba(192,192,192,0.12)",
        }}
      >
        {/* ── Step 1: ENTERING — dramatic angel entrance ─────────────── */}
        {step === "ENTERING" && (
          <div className="flex flex-col items-center justify-center gap-4 py-10">
            <div
              className="animate-in fade-in duration-700"
              style={{ animationFillMode: "backwards" }}
            >
              {renderAvatar("xl")}
            </div>
            <p
              className="text-xs uppercase tracking-[0.25em] animate-in fade-in duration-1000"
              style={{
                color: ALBEDO.silver,
                animationDelay: "300ms",
                animationFillMode: "backwards",
              }}
            >
              {angel.isVoid
                ? `${angel.glyph} ${angel.name} / The Abyss`
                : `${angel.name} enters the chamber`}
            </p>
            <p
              className="text-base italic text-center max-w-xs animate-in fade-in duration-1000"
              style={{
                color: angel.isVoid
                  ? "rgba(192,192,192,0.6)"
                  : ALBEDO.white,
                textShadow: angel.isVoid
                  ? "0 0 6px rgba(192,192,192,0.2)"
                  : "0 0 6px rgba(255,255,255,0.4)",
                animationDelay: "600ms",
                animationFillMode: "backwards",
              }}
            >
              {angel.materiaPrompt}
            </p>
          </div>
        )}

        {/* ── Step 2: MATERIA — user types the concept ────────────────── */}
        {step === "MATERIA" && (
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">{renderAvatar("lg")}</div>
              <div className="min-w-0">
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  {angel.isVoid
                    ? `${angel.glyph} Da\u2019ath \u2014 ${hz} Hz`
                    : `${angel.name} \u2014 ${hz} Hz`}
                </p>
                <p
                  className="text-sm italic mt-1"
                  style={{
                    color: angel.isVoid
                      ? "rgba(192,192,192,0.6)"
                      : ALBEDO.white,
                    textShadow: angel.isVoid
                      ? "0 0 4px rgba(192,192,192,0.15)"
                      : "0 0 4px rgba(255,255,255,0.3)",
                  }}
                >
                  {angel.materiaPrompt}
                </p>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Describe the materia \u2014 the sound, the feeling, the scene..."
              rows={4}
              className="w-full rounded-md border bg-transparent p-3 text-sm focus:outline-none focus:ring-1 resize-none"
              style={{
                color: ALBEDO.white,
                borderColor: angel.isVoid
                  ? "rgba(192,192,192,0.15)"
                  : ALBEDO.silver,
                boxShadow: angel.isVoid
                  ? "inset 0 0 30px rgba(0,0,0,0.8)"
                  : "inset 0 0 16px rgba(192,192,192,0.06)",
              }}
            />

            <div className="space-y-1.5">
              <Label
                htmlFor="invocation-genre"
                className="text-xs"
                style={{ color: ALBEDO.silver }}
              >
                Genre (optional)
              </Label>
              <Input
                id="invocation-genre"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="dark ambient, lo-fi hip-hop..."
                className="bg-transparent"
                style={{
                  color: ALBEDO.white,
                  borderColor: angel.isVoid
                    ? "rgba(192,192,192,0.15)"
                    : "rgba(192,192,192,0.4)",
                }}
              />
            </div>

            {refineMutation.error && (
              <p className="text-xs" style={{ color: ALBEDO.red }}>
                {refineMutation.error instanceof Error
                  ? refineMutation.error.message
                  : "The refinement failed. Try again."}
              </p>
            )}

            <div className="flex justify-between items-center">
              <span
                className="text-[11px] italic"
                style={{ color: "rgba(192,192,192,0.5)" }}
              >
                {angel.isVoid ? "The void accepts." : angel.voice}
              </span>
              <Button
                onClick={() => refineMutation.mutate()}
                disabled={concept.trim().length < 3 || refineMutation.isPending}
                style={{
                  backgroundColor: ALBEDO.white,
                  color: ALBEDO.black,
                  borderColor: ALBEDO.silver,
                  boxShadow: "0 0 12px rgba(255,255,255,0.3)",
                }}
              >
                Speak
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2.5: REFINING — LLM is working ────────────────────── */}
        {step === "REFINING" && (
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
              {angel.isVoid
                ? "The Abyss contemplates\u2026"
                : `${angel.name} consults the council\u2026`}
            </p>
          </div>
        )}

        {/* ── Step 3: SUMMARIZING — confirm the working ──────────────── */}
        {step === "SUMMARIZING" && (
          <div className="space-y-5 py-2">
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">{renderAvatar("lg")}</div>
              <div className="min-w-0">
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  {angel.isVoid ? "The Abyss reflects" : `${angel.name} presents the working`}
                </p>
                {refined ? (
                  <>
                    <p
                      className="text-sm italic mt-2 leading-relaxed"
                      style={{
                        color: ALBEDO.white,
                        textShadow: "0 0 5px rgba(255,255,255,0.35)",
                      }}
                    >
                      {refined.rationale}
                    </p>
                    <div
                      className="rounded-lg border p-3 mt-3 space-y-1.5"
                      style={{
                        borderColor: "#1f1f1f",
                        backgroundColor: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <p className="text-sm" style={{ color: ALBEDO.white }}>
                        {refined.concept}
                      </p>
                      <p className="text-xs" style={{ color: ALBEDO.silver }}>
                        {refined.targetChakra} {"\u00B7"} {refined.targetFrequency} Hz {"\u00B7"}{" "}
                        <span className="italic">{refined.genre}</span>
                      </p>
                    </div>
                  </>
                ) : (
                  <p
                    className="text-base italic mt-2"
                    style={{
                      color: ALBEDO.white,
                      textShadow: "0 0 5px rgba(255,255,255,0.35)",
                    }}
                  >
                    We will compose{" "}
                    <span style={{ color: ALBEDO.yellow }}>
                      &ldquo;{concept.trim().length > 80
                        ? concept.trim().slice(0, 80) + "\u2026"
                        : concept.trim()}&rdquo;
                    </span>{" "}
                    at{" "}
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: ALBEDO.white }}
                    >
                      {hz} Hz
                    </span>
                    .
                    {genre.trim() && (
                      <>
                        {" "}
                        Genre:{" "}
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>
                          {genre.trim()}
                        </span>
                        .
                      </>
                    )}
                  </p>
                )}
                <p
                  className="text-sm mt-3"
                  style={{ color: ALBEDO.silver }}
                >
                  Shall I dispatch the council?
                </p>
              </div>
            </div>

            {dispatchMutation.error && (
              <p className="text-xs" style={{ color: ALBEDO.red }}>
                {dispatchMutation.error instanceof Error
                  ? dispatchMutation.error.message
                  : "The working could not begin. Try again."}
              </p>
            )}

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep("MATERIA")}
                style={{ color: ALBEDO.silver }}
              >
                Reword
              </Button>
              <Button
                onClick={() => dispatchMutation.mutate()}
                disabled={dispatchMutation.isPending}
                style={{
                  backgroundColor: ALBEDO.yellow,
                  color: ALBEDO.black,
                  borderColor: ALBEDO.silver,
                  boxShadow: "0 0 14px rgba(255,215,0,0.4)",
                }}
              >
                {dispatchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : null}
                Begin Working
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3.5: DISPATCHING — auto-run in progress ───────────── */}
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

        {/* ── Step 4: DISPATCHED — confirmation ──────────────────────── */}
        {step === "DISPATCHED" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-1">{renderAvatar("lg")}</div>
              <div className="min-w-0">
                <p
                  className="text-xs uppercase tracking-[0.25em]"
                  style={{ color: ALBEDO.silver }}
                >
                  {angel.isVoid
                    ? "The void has spoken"
                    : `${angel.name} has dispatched the working`}
                </p>
                <p
                  className="text-base italic mt-1.5"
                  style={{
                    color: ALBEDO.white,
                    textShadow: "0 0 5px rgba(255,215,0,0.3)",
                  }}
                >
                  {angel.isVoid
                    ? "It echoes across the Abyss. Watch the kanban."
                    : "Watch the kanban. The opus begins in Nigredo."}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={handleClose}
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
