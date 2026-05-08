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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Sparkles, Layers, ScrollText, Trash2 } from "lucide-react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { AngelChamberDialog } from "@/components/AngelChamberDialog";
import { AngelInvocationDialog } from "@/components/AngelInvocationDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// ChakraFrequencyMap and BatchProgressPanel removed — MiniMax-only pipeline
import { ArchangelAvatar, ArchangelAvatarStack } from "@/components/ArchangelAvatar";
import { ChakraYantra, type ArchangelName, type ChakraKey } from "@/components/SacredGeometry";
import { useAudioAmplitude } from "@/lib/useAudioAmplitude";
import { cn } from "@/lib/utils";
import { numberToWords, capitalizeFirst } from "@/lib/numberToWords";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import {
  sunoPipelineApi,
  SUNO_BOARD_COLUMNS,
  SUNO_CHAKRAS,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoAudioVariant,
  type SunoChakra,
  type SunoIssue,
  type SunoStatus,
} from "@/api/sunoPipeline";
import type { Agent } from "@paperclipai/shared";

const STATUS_LABEL: Record<SunoStatus, string> = {
  DRAFT: "Nigredo",
  GENERATING: "Albedo",
  REVIEW: "Citrinitas",
  APPROVED: "Rubedo",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

/**
 * Magnum Opus stage mapping for kanban column accents.
 * The pipeline's status arc IS the alchemical opus arc:
 *   DRAFT (Nigredo)      → black, the prima materia, raw concept
 *   GENERATING (Albedo)  → white/silver, the work being purified
 *   REVIEW (Citrinitas)  → yellow, illumination, dawn before the stone
 *   APPROVED (Rubedo)    → red, the philosopher's stone is realized
 *   PUBLISHED            → completed work goes out into the world
 *   FAILED               → the opus dissolved, returned to source
 */
const STATUS_OPUS_COLOR: Record<SunoStatus, { bg: string; border: string; label: string; glyph: string }> = {
  DRAFT:      { bg: "#000000", border: "#C0C0C0", label: "Nigredo",    glyph: "⬛" },
  GENERATING: { bg: "#FFFFFF", border: "#C0C0C0", label: "Albedo",     glyph: "⬜" },
  REVIEW:     { bg: "#FFD700", border: "#C0C0C0", label: "Citrinitas", glyph: "🟨" },
  APPROVED:   { bg: "#DC143C", border: "#C0C0C0", label: "Rubedo",     glyph: "🟥" },
  PUBLISHED:  { bg: "#FFFFFF", border: "#FFD700", label: "Lapis",      glyph: "⚪" },
  FAILED:     { bg: "#000000", border: "#DC143C", label: "Solutio",    glyph: "⚫" },
};

// Hermes Squad Quick Start — each preset glyph drawn from the
// alchemical / planetary register to keep the Albedo aesthetic
// consistent across the pipeline. ☿ Mercury for focus, 🜍 Sulphur
// for creative fire, ♃ Jupiter for benevolent expansion, ⬛ Nigredo
// for shadow, ☽ Moon for night, ♂ Mars for drive, ☉ Sun for dawn,
// 🜄 Water for settling, ⬜ Albedo for completion, 🜔 Salt for
// stillness, ♄ Saturn for weight, 🜃 Earth for grounding, 🌑 New Moon
// for sleep.
const MOOD_PRESET_CHIPS = [
  { id: "deep-work", label: "Deep Work", emoji: "\u{263F}", concept: "Dark minimalist ambient instrumental designed for deep focus and long-form cognitive work.", targetChakra: "THIRD_EYE" as SunoChakra, genre: "dark ambient, minimal electronic, drone, cinematic texture, experimental" },
  { id: "creative-flow", label: "Creative Flow", emoji: "\u{1F70D}", concept: "Warm ambient electronic instrumental that gradually shifts from deep introspective calm into gentle creative flow.", targetChakra: "HEART" as SunoChakra, genre: "ambient electronic, warm pads, cinematic texture, experimental, minimal" },
  { id: "calm-productivity", label: "Calm Productivity", emoji: "\u{2643}", concept: "Clean, calm ambient instrumental for steady productivity and relaxed focus.", targetChakra: "SOLAR" as SunoChakra, genre: "ambient, minimal electronic, calm, atmospheric, unobtrusive" },
  { id: "shadow-work", label: "Shadow Work", emoji: "\u{2B1B}", concept: "Dark ambient instrumental designed for shadow integration with emotional regulation.", targetChakra: "ROOT" as SunoChakra, genre: "dark ambient, drone, ethereal bass, shadow integration" },
  { id: "night-drive", label: "Night Drive", emoji: "\u{263D}", concept: "Driving through an empty city at 2am with tinted windows.", targetChakra: "SACRAL" as SunoChakra, genre: "dark trap, phonk, memphis rap instrumental, cinematic hip-hop" },
  { id: "gym-run", label: "Gym / Run", emoji: "\u{2642}", concept: "Controlled rage, not reckless anger. A machine, not an animal.", targetChakra: "ROOT" as SunoChakra, genre: "dark industrial hip-hop, aggressive trap, grime instrumental, phonk" },
  { id: "morning-walk", label: "Morning Walk", emoji: "\u{2609}", concept: "A man walking through cold air with purpose.", targetChakra: "SOLAR" as SunoChakra, genre: "boom bap, instrumental hip-hop, golden era beats, dusty samples" },
  { id: "wind-down", label: "Wind Down", emoji: "\u{1F704}", concept: "Cooking something good alone in a clean kitchen with low lighting.", targetChakra: "HEART" as SunoChakra, genre: "lo-fi hip-hop, chillhop, smooth jazz beats, ambient R&B instrumental" },
  { id: "alpha-theta-bridge", label: "Work Wrap-Up", emoji: "\u{2B1C}", concept: "Dark ambient soundscape designed for late-night focus and calm.", targetChakra: "THIRD_EYE" as SunoChakra, genre: "dark ambient, minimal, luxury" },
  { id: "architect-silence", label: "Architect Silence", emoji: "\u{1F714}", concept: "Dark AI ambient drone with no tempo and no identifiable structure.", targetChakra: "CROWN" as SunoChakra, genre: "dark ambient, drone, void" },
  { id: "dark-piano", label: "Dark Piano", emoji: "\u{2644}", concept: "Sparse, slow piano notes played in a dark ambient space.", targetChakra: "HEART" as SunoChakra, genre: "dark piano, ambient luxury" },
  { id: "pre-sleep", label: "Pre-Sleep", emoji: "\u{1F703}", concept: "Ultra-minimal ambient soundscape designed for late-night listening and subconscious learning.", targetChakra: "CROWN" as SunoChakra, genre: "ultra-minimal, dark ambient, near-silence" },
  { id: "sleep", label: "Sleep", emoji: "\u{1F311}", concept: "Ultra-minimalist dark ambient soundscape designed for neural shutdown.", targetChakra: "CROWN" as SunoChakra, genre: "dark ambient, drone, sleep music, deep space, minimal electronic" },
];

// ── Batch generation presets (CLAUDE.md MOOD_PRESETS + 4 extras) ──────────────
const BATCH_PRESETS: {
  id: string;
  label: string;
  emoji: string;
  concept: string;
  targetChakra: SunoChakra;
  genre: string;
}[] = [
  {
    id: "deep-coding",
    label: "Deep Coding",
    emoji: "\u{1F5A5}",
    concept: "3am server room, one dim monitor, hypnotic repetitive minimal. Dark sub-bass pulse, sparse kick, no hooks, flat energy. Loop forever.",
    targetChakra: "THIRD_EYE",
    genre: "dark minimalist hip-hop, ambient trap, lo-fi industrial",
  },
  {
    id: "night-drive",
    label: "Night Drive",
    emoji: "\u{1F319}",
    concept: "Driving through an empty city at 2am with tinted windows. Deep 808 slides, haunted piano loop, sparse hi-hats, menacing but controlled.",
    targetChakra: "SACRAL",
    genre: "dark trap, phonk, memphis rap instrumental, cinematic hip-hop",
  },
  {
    id: "creative-flow",
    label: "Creative Flow",
    emoji: "\u{1F3A8}",
    concept: "Golden hour through a dusty window. Warm Rhodes, soft brushed snare, subtle bass groove, tape hiss. Calm confidence, unhurried mastery.",
    targetChakra: "HEART",
    genre: "lo-fi hip-hop, ambient jazz, chill instrumental, warm analog",
  },
  {
    id: "shadow-work",
    label: "Shadow Work",
    emoji: "\u{1F52E}",
    concept: "Controlled descent, sinking into warm black water. One evolving dark pad with slow amplitude modulation at 6 cycles per second. No resolution.",
    targetChakra: "ROOT",
    genre: "dark ambient, drone, ethereal bass music, witch house",
  },
  {
    id: "gym-run",
    label: "Gym / Run",
    emoji: "\u{1F4AA}",
    concept: "Controlled rage, not reckless anger. A machine, not an animal. Distorted 808 kicks, industrial metallic textures, relentless forward momentum.",
    targetChakra: "ROOT",
    genre: "dark industrial hip-hop, aggressive trap, grime instrumental, phonk",
  },
  {
    id: "morning-walk",
    label: "Morning Walk",
    emoji: "\u{1F6B6}",
    concept: "A man walking through cold air with purpose. Not celebrating, not mourning — just moving. Chopped soul sample, punchy boom-bap, quiet strength.",
    targetChakra: "SOLAR",
    genre: "boom bap, instrumental hip-hop, golden era beats, dusty samples",
  },
  {
    id: "wind-down",
    label: "Wind Down",
    emoji: "\u{1F373}",
    concept: "Cooking something good alone in a clean kitchen with low lighting. Warm bassline, gentle keys, comfortable solitude, no urgency at all.",
    targetChakra: "HEART",
    genre: "lo-fi hip-hop, chillhop, smooth jazz beats, ambient R&B instrumental",
  },
  {
    id: "sleep-descent",
    label: "Sleep",
    emoji: "\u{1F634}",
    concept: "Floating in a sealed black vault. Single low drone evolving imperceptibly. No rhythm, no emotion, pure neutral descent. Loop at very low volume.",
    targetChakra: "CROWN",
    genre: "dark ambient, drone, sleep music, deep space, minimal electronic",
  },
  // Four additional sphere presets
  {
    id: "void-state",
    label: "Void State",
    emoji: "\u{26AB}",
    concept: "Total silence that breathes. A formless black field with one low pulse every 8 seconds. Pre-creation, pre-thought, pure potential.",
    targetChakra: "CROWN",
    genre: "dark ambient, extreme minimal, void, deep drone, sub-bass only",
  },
  {
    id: "architect-mode",
    label: "Architect Mode",
    emoji: "\u{26F2}",
    concept: "Designing systems in cold fluorescent light. Sharp metallic clicks, rigid quantized groove, zero emotion, maximum clarity.",
    targetChakra: "THIRD_EYE",
    genre: "industrial minimal, modular synth, cold wave, functional ambient",
  },
  {
    id: "temple-run",
    label: "Temple Run",
    emoji: "\u{1F3DB}",
    concept: "Running through stone corridors toward dawn. Ancient percussion rhythm, ceremonial, determined. Each step a ritual act.",
    targetChakra: "SOLAR",
    genre: "tribal percussion, cinematic world, ceremonial ambient, ritualistic",
  },
  {
    id: "midnight-mass",
    label: "Midnight Mass",
    emoji: "\u{269B}",
    concept: "High cathedral ceiling at 3am. Pipe organ drone, single candle, dust motes falling through light. Reverent, vast, alone.",
    targetChakra: "CROWN",
    genre: "dark sacred, organ drone, gothic ambient, ecclesiastical",
  },
];

const PIPELINE_AGENTS: { name: ArchangelName; role: string; sphere: string; domain: string }[] = [
  { name: "Michael", role: "Commander", sphere: "Geburah", domain: "Assigns agents, dispatches issues" },
  { name: "Uriel", role: "Sound Prompt", sphere: "Netzach", domain: "Writes Suno/MiniMax description text" },
  { name: "Zadkiel", role: "Lyricist", sphere: "Chesed", domain: "Chakra-resonant lyrics or [Instrumental]" },
  { name: "Jophiel", role: "Visual Art", sphere: "Chokmah", domain: "Cover art prompt & image generation" },
  { name: "Raziel", role: "Audio Engineer", sphere: "Chokmah", domain: "Drives Suno UI + MiniMax API" },
  { name: "Raphael", role: "Reviewer", sphere: "Tiphareth", domain: "Approves or rejects the output" },
  { name: "Gabriel", role: "Release Copy", sphere: "Yesod", domain: "Caption, hashtags, release notes" },
  { name: "Sandalphon", role: "Publisher", sphere: "Malkuth", domain: "Ships to DistroKid" },
  { name: "Metatron", role: "Timeline", sphere: "Keter", domain: "Activity log & celestial scribe" },
];

const ALBEDO_PAGE = { yellow: "#FFD700" };

const sunoQueryKey = (companyId: string) => ["suno-pipeline", companyId] as const;

export function SunoPipeline() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [chamberOpen, setChamberOpen] = useState(false);
  const [conceptDraft, setConceptDraft] = useState("");
  const [chakraDraft, setChakraDraft] = useState<SunoChakra>("HEART");
  const [genreDraft, setGenreDraft] = useState("");
  const [musicBackend, setMusicBackend] = useState<"minimax" | "suno">("minimax");

  // ── Angel Invocation Dialog state ──────────────────────────────────────
  const [invocationOpen, setInvocationOpen] = useState(false);
  const [invocationChakra, setInvocationChakra] = useState<SunoChakra>("HEART");
  const [invocationConcept, setInvocationConcept] = useState<string>();
  const [invocationGenre, setInvocationGenre] = useState<string>();

  // ── Task B: Batch sphere generation state ────────────────────────────────
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  /**
   * Fire all BATCH_PRESETS: create each as a new SunoIssue then immediately
   * call auto-run with minimax backend. 500ms stagger between dispatches.
   */
  const invokeSpheres = async (presets: typeof BATCH_PRESETS) => {
    if (batchRunning || !selectedCompanyId) return;
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: presets.length });
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i]!;
      try {
        // Step 1: create the issue
        const issue = await sunoPipelineApi.create(selectedCompanyId, {
          concept: preset.concept,
          targetChakra: preset.targetChakra,
          genre: preset.genre,
        });
        // Step 2: fire auto-run immediately
        await sunoPipelineApi.autoRun(issue.id, selectedCompanyId, {
          musicBackend,
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
      setBatchProgress({ done: i + 1, total: presets.length });
      // Stagger next dispatch by 500ms
      if (i < presets.length - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    }
    queryClient.invalidateQueries({ queryKey: sunoQueryKey(selectedCompanyId) });
    setBatchRunning(false);
    setBatchProgress(null);
    pushToast({
      tone: succeeded > 0 ? "success" : "error",
      title: "Spheres invoked",
      body: `${succeeded} dispatched${failed > 0 ? `, ${failed} failed` : ""}.`,
      ttlMs: 7000,
    });
  };

  // Resolve which preset is selected (if any) by matching concept text
  const selectedPreset = useMemo(
    () => MOOD_PRESET_CHIPS.find((p) => p.concept === conceptDraft) ?? null,
    [conceptDraft],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "The Hermetic Opera" }]);
  }, [setBreadcrumbs]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: sunoQueryKey(selectedCompanyId ?? "_"),
    queryFn: () => sunoPipelineApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 5000, // Poll every 5s to show processing progress
  });

  const { data: processingJobs } = useQuery({
    queryKey: ["suno-pipeline-processing", selectedCompanyId ?? "_"] as const,
    queryFn: () => sunoPipelineApi.processing(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 2000, // Poll every 2s for live progress
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
        targetChakra: "HEART" as SunoChakra,
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return sunoPipelineApi.delete(id, selectedCompanyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sunoQueryKey(selectedCompanyId ?? "_"),
      });
    },
  });

  const bulkDissolveMutation = useMutation({
    mutationFn: (ids: string[]) => {
      if (!selectedCompanyId) throw new Error("No company selected");
      return sunoPipelineApi.bulkTransition(selectedCompanyId, ids, "FAILED", "bulk dissolve");
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
    <div className="suno-flower-backdrop flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-5">
          {/* Caduceus badge — total tracks counter, lunar-mercurial Albedo glow */}
          <CaduceusBadge totalTracks={issues?.length ?? 0} />
          <div className="pt-1">
            <h1
              className="text-3xl font-semibold tracking-tight"
              style={{
                color: "#FFFFFF",
                textShadow:
                  "0 0 8px rgba(255,255,255,0.55), 0 0 18px rgba(192,192,192,0.35), 0 0 32px rgba(192,192,192,0.18)",
              }}
            >
              <span aria-hidden style={{ marginRight: "0.4rem" }}>⚕</span>
              The Hermetic Opera
            </h1>
            <p
              className="text-sm mt-1.5 italic"
              style={{
                color: "#C0C0C0",
                textShadow: "0 0 6px rgba(192,192,192,0.25)",
                letterSpacing: "0.02em",
              }}
            >
              The harmony of the spheres, made audible.
            </p>
            <p
              className="text-xs mt-0.5 tabular-nums"
              style={{
                color: "rgba(192,192,192,0.6)",
                letterSpacing: "0.02em",
              }}
            >
              {(issues?.length ?? 0) > 0
                ? `${capitalizeFirst(numberToWords(issues?.length ?? 0))} opera and counting.`
                : "The first opus awaits."}
            </p>
          </div>
        </div>
        {/* Header actions:
            - "Consult the Council" opens the Angel Chamber ritual flow.
            - "Invoke the Spheres" batch-creates + auto-runs all mood presets.
            - "Begin Opus" opens the bare single-concept form. */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Music backend selector */}
          <div className="flex items-center rounded-md border border-border/30 overflow-hidden text-[11px]">
            <button
              onClick={() => setMusicBackend("minimax")}
              className={`px-3 py-1.5 transition-colors ${musicBackend === "minimax" ? "bg-white/10 text-foreground font-medium" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            >
              MiniMax
            </button>
            <button
              onClick={() => setMusicBackend("suno")}
              className={`px-3 py-1.5 transition-colors border-l border-border/30 ${musicBackend === "suno" ? "bg-white/10 text-foreground font-medium" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            >
              Suno
            </button>
          </div>

          {/* Task B: Invoke the Spheres — batch create + auto-run all presets */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={batchRunning || !selectedCompanyId}
                size="sm"
                style={{
                  backgroundColor: batchRunning ? "rgba(14,165,233,0.3)" : "#0369a1",
                  color: "#FFFFFF",
                  borderColor: "#38bdf8",
                  boxShadow:
                    "0 0 14px rgba(3,105,161,0.45), inset 0 0 10px rgba(56,189,248,0.15)",
                  opacity: batchRunning ? 0.7 : 1,
                }}
              >
                <Layers className="h-4 w-4 mr-1" />
                {batchRunning && batchProgress
                  ? `Generating ${batchProgress.done}/${batchProgress.total}…`
                  : "Invoke the Spheres"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground">
                Batch Generation
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => invokeSpheres(BATCH_PRESETS)}
                className="cursor-pointer"
              >
                <Layers className="h-3.5 w-3.5 mr-2 shrink-0" />
                All 12 Presets
                <span className="ml-auto text-[10px] text-muted-foreground">12 songs</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {BATCH_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => invokeSpheres([preset])}
                  className="cursor-pointer"
                >
                  <span className="mr-2 text-sm">{preset.emoji}</span>
                  <span className="truncate">{preset.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Existing: Consult the Council — opens Angel Chamber dialog */}
          <Button
            onClick={() => setChamberOpen(true)}
            size="sm"
            style={{
              backgroundColor: "#FFD700",
              color: "#000000",
              borderColor: "#C0C0C0",
              boxShadow:
                "0 0 14px rgba(255,215,0,0.45), inset 0 0 10px rgba(255,215,0,0.2)",
            }}
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Consult the Council
          </Button>
          <Button
            onClick={() => setShowCreate((v) => !v)}
            size="sm"
            variant="ghost"
            style={{ color: showCreate ? ALBEDO_PAGE.yellow : "#C0C0C0" }}
          >
            {showCreate ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {showCreate ? "Cancel" : "Begin Opus"}
          </Button>
        </div>
      </div>

      {/* Angel Chamber — the ritual flow that replaces the bare form when
          the user clicks "Consult the Council." */}
      {selectedCompanyId && (
        <AngelChamberDialog
          open={chamberOpen}
          onOpenChange={setChamberOpen}
          companyId={selectedCompanyId}
          onDispatched={() =>
            queryClient.invalidateQueries({ queryKey: sunoQueryKey(selectedCompanyId) })
          }
        />
      )}

      {/* Angel Invocation — single-song ritual modal opened from
          chakra cells or mood preset chips. */}
      {selectedCompanyId && (
        <AngelInvocationDialog
          open={invocationOpen}
          onOpenChange={setInvocationOpen}
          companyId={selectedCompanyId}
          chakra={invocationChakra}
          preloadedConcept={invocationConcept}
          preloadedGenre={invocationGenre}
          musicBackend={musicBackend}
          onDispatched={() =>
            queryClient.invalidateQueries({ queryKey: sunoQueryKey(selectedCompanyId) })
          }
        />
      )}

      {showCreate && (
        <Card className="p-4 space-y-4">
          {/* ── Mood Preset Chips ── */}
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Quick Start</Label>
            <div className="flex flex-wrap gap-2">
              {MOOD_PRESET_CHIPS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setInvocationChakra(preset.targetChakra);
                    setInvocationConcept(preset.concept);
                    setInvocationGenre(preset.genre);
                    setInvocationOpen(true);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    "border-border/50 bg-card/50 text-foreground hover:bg-accent hover:border-foreground/20",
                  )}
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Preset selected: show summary + Create ── */}
          {/* ── Custom: show full form ── */}
          {selectedPreset ? (
            <div className="flex items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedPreset.targetChakra}</span>
                <span>·</span>
                <span>{SUNO_CHAKRA_FREQUENCIES[selectedPreset.targetChakra]} Hz</span>
                <span>·</span>
                <span className="truncate max-w-[300px]">{selectedPreset.genre}</span>
              </div>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                size="sm"
              >
                {createMutation.isPending ? "…" : "Create"}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-7 space-y-1.5">
                <Label htmlFor="suno-concept">Custom Concept</Label>
                <Input
                  id="suno-concept"
                  placeholder="type your own vibe…"
                  value={conceptDraft}
                  onChange={(e) => setConceptDraft(e.target.value)}
                />
              </div>
              <div className="md:col-span-4 space-y-1.5">
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
                  {createMutation.isPending ? "…" : "Go"}
                </Button>
              </div>
            </div>
          )}
          {createMutation.error && (
            <p className="text-xs text-destructive mt-2">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create"}
            </p>
          )}
        </Card>
      )}

      {/* Processing Jobs — live progress strip */}
      {processingJobs && processingJobs.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium uppercase tracking-wider text-amber-400/80">
              {processingJobs.filter(j => !j.finishedAt).length} Processing
            </span>
          </div>
          {processingJobs.filter(j => !j.finishedAt).map(job => {
            const stages = ["assign","dispatch","soundPrompt","lyrics","visualPrompt","music","coverArt","releaseCopy","review"];
            const currentIdx = stages.indexOf(job.currentStage);
            const stageLabels: Record<string, string> = {
              assign: "Assigning", dispatch: "Dispatching", soundPrompt: "Uriel (Sound)",
              lyrics: "Zadkiel (Lyrics)", visualPrompt: "Jophiel (Visual)", music: "MiniMax (Audio)",
              coverArt: "Jophiel (Cover)", releaseCopy: "Gabriel (Copy)", review: "Review",
            };
            return (
              <div key={job.id} className="flex items-center gap-3">
                <div className="flex gap-0.5 shrink-0">
                  {stages.map((s, i) => (
                    <div
                      key={s}
                      className={cn(
                        "h-1.5 w-2.5 rounded-full transition-all",
                        i < currentIdx ? "bg-emerald-500/70" :
                        i === currentIdx ? "bg-amber-400 animate-pulse" :
                        "bg-white/10"
                      )}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-amber-300/80 font-medium truncate">
                  {stageLabels[job.currentStage] ?? job.currentStage}
                </span>
                <span className="text-[10px] text-muted-foreground/50 truncate flex-1">
                  {job.concept.slice(0, 40)}
                </span>
                <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0">
                  {Math.round((Date.now() - job.startedAt) / 1000)}s
                </span>
              </div>
            );
          })}
          {processingJobs.filter(j => j.currentStage === "done").map(job => (
            <div key={job.id} className="flex items-center gap-2 text-[10px] text-emerald-400/60">
              <span>Done: {job.concept.slice(0, 40)}</span>
            </div>
          ))}
          {processingJobs.filter(j => j.currentStage === "failed").map(job => (
            <div key={job.id} className="flex items-center gap-2 text-[10px] text-red-400/60">
              <span>Failed: {job.concept.slice(0, 30)} — {job.error?.slice(0, 50)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Archangel Agent Bar — shows the pipeline agents in order */}
      <ArchangelAgentBar issues={issues ?? []} />

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
              onDelete={(id) => deleteMutation.mutate(id)}
              onBulkDissolve={(ids) => bulkDissolveMutation.mutate(ids)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Archangel Agent Bar                                                       */
/* -------------------------------------------------------------------------- */

interface ArchangelAgentBarProps {
  issues: SunoIssue[];
}

/**
 * Caduceus badge — Hermes' twin-snake-and-winged-staff in the Albedo
 * glow register, with the total-tracks count beneath. The caduceus is
 * the boundary-crossing / mediation glyph — exactly the Hermes Squad's
 * orchestration register, NOT the Rod of Asclepius (one snake, no
 * wings) which belongs to medicine.
 */
function CaduceusBadge({ totalTracks }: { totalTracks: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 shrink-0"
      style={{
        backgroundColor: "#0a0a0a",
        borderColor: "#1a1a1a",
        boxShadow:
          "inset 0 0 32px rgba(192,192,192,0.06), 0 0 22px rgba(255,255,255,0.10), 0 4px 18px rgba(0,0,0,0.6)",
        width: 104,
        height: 104,
      }}
      title={`${totalTracks} tracks in this pipeline — caduceus, the Hermes Squad orchestration glyph`}
    >
      <svg
        viewBox="0 0 64 80"
        width="56"
        height="68"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter:
            "drop-shadow(0 0 3px rgba(255,255,255,1)) drop-shadow(0 0 8px rgba(255,255,255,0.7)) drop-shadow(0 0 16px rgba(192,192,192,0.45))",
        }}
        aria-hidden
      >
        {/* central staff */}
        <line x1="32" y1="14" x2="32" y2="68" />
        {/* orb at top */}
        <circle cx="32" cy="13" r="2.6" fill="#FFFFFF" />
        {/* left wing */}
        <path d="M32 22 C 22 20, 14 22, 8 28 C 14 26, 20 26, 26 27 M32 26 C 22 26, 14 28, 10 32 C 16 30, 22 30, 27 31" />
        {/* right wing (mirror) */}
        <path d="M32 22 C 42 20, 50 22, 56 28 C 50 26, 44 26, 38 27 M32 26 C 42 26, 50 28, 54 32 C 48 30, 42 30, 37 31" />
        {/* left serpent — sinusoidal climb */}
        <path d="M32 32 C 22 36, 22 40, 32 44 C 42 48, 42 52, 32 56 C 22 60, 22 64, 28 68" />
        {/* right serpent — counter-phase */}
        <path d="M32 32 C 42 36, 42 40, 32 44 C 22 48, 22 52, 32 56 C 42 60, 42 64, 36 68" />
        {/* serpent heads (small ovals) */}
        <ellipse cx="22.5" cy="34" rx="2" ry="1.4" fill="#FFFFFF" />
        <ellipse cx="41.5" cy="34" rx="2" ry="1.4" fill="#FFFFFF" />
      </svg>
      <span
        className="text-base font-semibold tabular-nums tracking-wide"
        style={{
          color: "#FFFFFF",
          textShadow:
            "0 0 4px rgba(255,255,255,1), 0 0 10px rgba(255,255,255,0.8), 0 0 18px rgba(192,192,192,0.5)",
        }}
      >
        {totalTracks}
      </span>
    </div>
  );
}

/**
 * Horizontal scrollable row of archangel "tarot cards" displayed above the
 * kanban board. Each card features the agent's sacred geometry avatar at xl
 * size, their name, Kabbalistic sphere, role, and domain description.
 */
function ArchangelAgentBar({ issues }: ArchangelAgentBarProps) {
  const hasGenerating = issues.some((i) => i.status === "GENERATING");

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
      {PIPELINE_AGENTS.map((agent, idx) => (
        <div
          key={agent.name}
          className={cn(
            "group relative flex flex-col items-center gap-2 min-w-[120px] w-[120px] shrink-0",
            "rounded-xl border border-border/40 bg-gradient-to-b from-card/80 to-card/40",
            "px-3 pt-4 pb-3 transition-all duration-200",
            "hover:border-foreground/20 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5",
            hasGenerating && "border-blue-500/30",
          )}
        >
          {/* Order badge */}
          <span className="absolute top-1.5 left-2 text-[9px] font-mono text-muted-foreground/50">
            {String(idx + 1).padStart(2, "0")}
          </span>

          {/* Avatar — xl size (96px) with sacred geometry halo.
              hoverable=true enables the hover overlay spin/glow; the
              parent div already carries `group` so the CSS selector fires. */}
          <ArchangelAvatar
            name={agent.name}
            size="xl"
            working={hasGenerating}
            hoverable
          />

          {/* Name */}
          <span className="text-sm font-semibold tracking-tight text-center leading-tight">
            {agent.name}
          </span>

          {/* Sphere — kabbalistic attribution */}
          <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest">
            {agent.sphere}
          </span>

          {/* Role divider */}
          <div className="w-8 h-px bg-border/60" />

          {/* Role + Domain */}
          <span className="text-[11px] font-medium text-foreground/80 text-center">
            {agent.role}
          </span>
          <span className="text-[9px] text-muted-foreground text-center leading-snug line-clamp-2">
            {agent.domain}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Kanban Column                                                             */
/* -------------------------------------------------------------------------- */

interface SunoColumnProps {
  status: SunoStatus;
  issues: SunoIssue[];
  agentNameById: Map<string, string>;
  onChangeStatus: (id: string, next: SunoStatus) => void;
  onDelete?: (id: string) => void;
  onBulkDissolve?: (ids: string[]) => void;
}

function SunoColumn({ status, issues, agentNameById, onChangeStatus, onDelete, onBulkDissolve }: SunoColumnProps) {
  const opus = STATUS_OPUS_COLOR[status];
  const [confirmBulk, setConfirmBulk] = useState(false);
  const showBulkActions = (status === "GENERATING" || status === "FAILED") && issues.length > 1;

  return (
    <div className="flex flex-col min-w-0">
      <div
        className="flex items-center justify-between px-2 py-2 mb-1 rounded-t-md border-t-2"
        style={{ borderTopColor: opus.bg }}
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span aria-hidden style={{ filter: "drop-shadow(0 0 2px " + opus.bg + ")" }}>{opus.glyph}</span>
          {STATUS_LABEL[status]}
        </span>
        <span className="flex items-center gap-1.5">
          {showBulkActions && onBulkDissolve && !confirmBulk && (
            <button
              onClick={() => setConfirmBulk(true)}
              className="text-[9px] text-muted-foreground hover:text-red-500 transition-colors"
              title={`Dissolve all ${issues.length} tracks`}
            >
              dissolve all
            </button>
          )}
          {confirmBulk && (
            <span className="flex items-center gap-1">
              <button
                onClick={() => { onBulkDissolve!(issues.map(i => i.id)); setConfirmBulk(false); }}
                className="text-[9px] text-red-500 font-medium"
              >
                confirm ({issues.length})
              </button>
              <button onClick={() => setConfirmBulk(false)} className="text-[9px] text-muted-foreground">
                cancel
              </button>
            </span>
          )}
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {issues.length}
          </span>
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
              onDelete={onDelete}
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
  onDelete?: (id: string) => void;
}

function SunoCard({ issue, agentNameById, onChangeStatus, onDelete }: SunoCardProps) {
  const queryClient = useQueryClient();
  const [showPrompts, setShowPrompts] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assigned = [
    issue.lyricsAgentId && agentNameById.get(issue.lyricsAgentId),
    issue.soundAgentId && agentNameById.get(issue.soundAgentId),
    issue.visualAgentId && agentNameById.get(issue.visualAgentId),
  ].filter(Boolean) as string[];

  // Pulse the avatar ring when the archangel is actively working on this
  // issue. GENERATING = all assigned pulse; REVIEW = Raphael (if present)
  // pulses while gating. Other statuses = no pulse.
  const workingNames =
    issue.status === "GENERATING"
      ? assigned
      : issue.status === "REVIEW"
        ? assigned.filter((n) => n === "Raphael")
        : [];

  const hasSuno = !!issue.audioUrl;
  const hasMinimax = !!issue.minimaxAudioUrl;
  const hasAB = hasSuno && hasMinimax;
  const audioBadge = hasAB ? "♪ A+B" : hasSuno ? "♪ A" : hasMinimax ? "♪ B" : null;

  const pickCanonMutation = useMutation({
    mutationFn: (variant: SunoAudioVariant | null) => {
      if (!issue.companyId) throw new Error("No company id on issue");
      return sunoPipelineApi.pickCanon(issue.id, issue.companyId, variant);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sunoQueryKey(issue.companyId) });
    },
  });

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
          {audioBadge && (
            <span
              aria-label="audio attached"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white backdrop-blur-sm"
            >
              {audioBadge}
            </span>
          )}
        </div>
      )}
      <div className="text-[13px] leading-snug font-medium line-clamp-2">
        {issue.concept}
      </div>
      {/* Processing stage indicator for GENERATING cards */}
      {issue.status === "GENERATING" && (() => {
        const meta = (issue.metadata as Record<string, unknown>) ?? {};
        const stages = (meta.stages && typeof meta.stages === "object" ? meta.stages : {}) as Record<string, unknown>;
        const pipeline = [
          { key: "lyrics", label: "Lyrics", agent: "Zadkiel" },
          { key: "soundPrompt", label: "Sound", agent: "Uriel" },
          { key: "visualPrompt", label: "Visual", agent: "Jophiel" },
          { key: "minimaxAudioUrl", label: "Audio", agent: "MiniMax" },
          { key: "releaseCopy", label: "Copy", agent: "Gabriel" },
        ];
        const doneCount = pipeline.filter(s => !!stages[s.key]).length;
        const currentStage = pipeline.find(s => !stages[s.key]);
        return (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex gap-0.5">
              {pipeline.map((s, i) => (
                <div
                  key={s.key}
                  className={cn(
                    "h-1 rounded-full transition-all",
                    i < doneCount ? "w-3 bg-emerald-500/70" :
                    i === doneCount ? "w-3 bg-amber-400/70 animate-pulse" :
                    "w-3 bg-white/10"
                  )}
                />
              ))}
            </div>
            {currentStage && (
              <span className="text-[9px] text-amber-400/70 animate-pulse">
                {currentStage.agent}
              </span>
            )}
          </div>
        );
      })()}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-sm border px-1.5 py-0.5 bg-muted/40">
          <ChakraYantra
            chakra={issue.targetChakra as ChakraKey}
            size={11}
            strokeWidth={2.5}
            spinning={issue.status === "GENERATING"}
          />
          {issue.targetChakra} · {issue.targetFrequency}Hz
        </span>
        {issue.genre && (
          <span className="text-[10px] text-muted-foreground italic">
            {issue.genre}
          </span>
        )}
      </div>
      {assigned.length > 0 && (
        <div className="flex items-center gap-2">
          <ArchangelAvatarStack
            names={assigned}
            workingNames={workingNames}
            size="xs"
          />
          <span className="text-[11px] text-muted-foreground truncate">
            {assigned.join(" · ")}
          </span>
        </div>
      )}
      {/* A/B audio variants — Suno (A-side) + MiniMax (B-side). Click the
          A or B chip to set the canonical winner; chip glows when picked.
          Both rows always render once status >= GENERATING so the empty
          slot is visible (rather than collapsing) — makes it obvious which
          backend hasn't generated yet. */}
      {(hasSuno || hasMinimax || issue.status !== "DRAFT") && (
        <div className="space-y-1 pt-0.5">
          {hasSuno ? (
            <AudioVariantRow
              label="A"
              source="Suno"
              src={issue.audioUrl!}
              isCanon={issue.canonAudioVariant === "suno"}
              onPick={() =>
                pickCanonMutation.mutate(
                  issue.canonAudioVariant === "suno" ? null : "suno",
                )
              }
              disabled={pickCanonMutation.isPending}
            />
          ) : (
            <EmptyVariantRow label="A" source="Suno" />
          )}
          {hasMinimax ? (
            <AudioVariantRow
              label="B"
              source="MiniMax"
              src={issue.minimaxAudioUrl!}
              isCanon={issue.canonAudioVariant === "minimax"}
              onPick={() =>
                pickCanonMutation.mutate(
                  issue.canonAudioVariant === "minimax" ? null : "minimax",
                )
              }
              disabled={pickCanonMutation.isPending}
            />
          ) : (
            <EmptyVariantRow label="B" source="MiniMax" />
          )}
        </div>
      )}
      {/* ── Prompt Viewer (stages) ── */}
      {(() => {
        const stages = (issue.metadata as { stages?: Record<string, string> })?.stages;
        const hasAny = stages && (stages.soundPrompt || stages.lyrics || stages.visualPrompt);
        if (!hasAny && issue.status === "DRAFT") return null;
        return (
          <div className="pt-0.5">
            <button
              onClick={() => setShowPrompts(!showPrompts)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <ScrollText className="h-3 w-3 shrink-0" />
              <span className="flex gap-1">
                <span className={stages?.soundPrompt ? "text-emerald-500" : "opacity-30"} title="Uriel (Sound)">U</span>
                <span className={stages?.lyrics ? "text-emerald-500" : "opacity-30"} title="Zadkiel (Lyrics)">Z</span>
                <span className={stages?.visualPrompt ? "text-emerald-500" : "opacity-30"} title="Jophiel (Visual)">J</span>
              </span>
              <span className="ml-auto text-[9px]">{showPrompts ? "hide" : "prompts"}</span>
            </button>
            {showPrompts && stages && (
              <div className="mt-1 space-y-1.5 text-[10px] leading-tight">
                {stages.soundPrompt && (
                  <div>
                    <span className="font-medium text-muted-foreground">Uriel:</span>
                    <p className="text-foreground/80 mt-0.5 whitespace-pre-wrap break-words max-h-20 overflow-y-auto scrollbar-auto-hide">
                      {stages.soundPrompt}
                    </p>
                  </div>
                )}
                {stages.lyrics && (
                  <div>
                    <span className="font-medium text-muted-foreground">Zadkiel:</span>
                    <p className="text-foreground/80 mt-0.5 whitespace-pre-wrap break-words max-h-20 overflow-y-auto scrollbar-auto-hide">
                      {stages.lyrics}
                    </p>
                  </div>
                )}
                {stages.visualPrompt && (
                  <div>
                    <span className="font-medium text-muted-foreground">Jophiel:</span>
                    <p className="text-foreground/80 mt-0.5 whitespace-pre-wrap break-words max-h-20 overflow-y-auto scrollbar-auto-hide">
                      {stages.visualPrompt}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {/* ── Status + Delete row ── */}
      <div className="flex items-center gap-1">
        <Select
          value={issue.status}
          onValueChange={(v) => onChangeStatus(issue.id, v as SunoStatus)}
        >
          <SelectTrigger className="h-6 text-[11px] py-0 px-2 flex-1">
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
        {onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => { onDelete(issue.id); setConfirmDelete(false); }}
                className="text-[9px] text-red-500 hover:text-red-400 font-medium px-1"
              >
                dissolve
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[9px] text-muted-foreground hover:text-foreground px-1"
              >
                keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
              title="Dissolve this working"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )
        )}
      </div>
      {/* ── Cover art prompt overlay ── */}
      {issue.thumbnailUrl && showPrompts && (issue.metadata as { stages?: Record<string, string> })?.stages?.visualPrompt && (
        <div className="text-[9px] text-muted-foreground italic -mt-0.5">
          Cover generated from Jophiel's prompt above
        </div>
      )}
    </div>
  );
}

interface AudioVariantRowProps {
  /** "A" or "B" — display chip. */
  label: string;
  /** "Suno" or "MiniMax" — engine label shown on hover. */
  source: string;
  src: string;
  isCanon: boolean;
  onPick: () => void;
  disabled: boolean;
}

/**
 * Empty placeholder row for an A or B variant slot when that backend
 * hasn't generated yet. Keeps the card height stable (Suno + MiniMax
 * always occupy two rows once status >= GENERATING) and makes it
 * obvious which backend is still pending.
 */
function EmptyVariantRow({ label, source }: { label: "A" | "B"; source: "Suno" | "MiniMax" }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-dashed border-border/40 bg-muted/10 px-2 py-1.5"
      title={`${source} (${label}-side) — not generated yet`}
    >
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold tabular-nums shrink-0"
        style={{
          color: "#C0C0C0",
          backgroundColor: "rgba(192,192,192,0.05)",
          border: "1px dashed #C0C0C0",
        }}
      >
        {label}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 shrink-0">
        {source}
      </span>
      <span className="text-[10px] text-muted-foreground/40 italic ml-auto">
        empty · pending
      </span>
    </div>
  );
}

// ── Global audio singleton — only one track plays at a time ──────────────
let _currentlyPlaying: HTMLAudioElement | null = null;
function registerAudioPlay(el: HTMLAudioElement) {
  if (_currentlyPlaying && _currentlyPlaying !== el) {
    _currentlyPlaying.pause();
  }
  _currentlyPlaying = el;
}

function AudioVariantRow({
  label,
  source,
  src,
  isCanon,
  onPick,
  disabled,
}: AudioVariantRowProps) {
  // Pulse the A/B chip in time with the audio amplitude while playing.
  // Falls back to a slow sine oscillation when CORS blocks AudioContext
  // analysis (most cross-origin Suno/MiniMax URLs).
  const { playing, amplitude, setAudioRef } = useAudioAmplitude();

  // Wrap the audio ref to hook into the global singleton
  const audioCallbackRef = useCallback((el: HTMLAudioElement | null) => {
    setAudioRef(el);
    if (el) {
      el.addEventListener("play", () => registerAudioPlay(el));
    }
  }, [setAudioRef]);

  // Map amplitude (0..1) to a subtle scale (1.0..1.18) and glow intensity.
  const scale = 1 + amplitude * 0.18;
  const glow = `drop-shadow(0 0 ${4 + amplitude * 10}px currentColor)`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        title={isCanon ? `${source} (canon)` : `Pick ${source} as canon`}
        className={cn(
          "shrink-0 inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold uppercase border transition-colors audio-wave-pulse",
          isCanon
            ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/50 ring-1 ring-emerald-400/40"
            : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        style={
          playing
            ? { transform: `scale(${scale})`, filter: glow }
            : undefined
        }
      >
        {label}
      </button>
      <audio
        ref={audioCallbackRef}
        src={src}
        controls
        preload="none"
        className="h-6 flex-1 min-w-0"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}
