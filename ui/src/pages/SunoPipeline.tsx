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
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Music, Plus, X, Sparkles, Users, Layers } from "lucide-react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { AngelChamberDialog } from "@/components/AngelChamberDialog";
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
import { ChakraFrequencyMap } from "@/components/ChakraFrequencyMap";
import { ArchangelAvatar, ArchangelAvatarStack } from "@/components/ArchangelAvatar";
import { ChakraYantra, type ArchangelName, type ChakraKey } from "@/components/SacredGeometry";
import { useAudioAmplitude } from "@/lib/useAudioAmplitude";
import { cn } from "@/lib/utils";
import { agentsApi } from "@/api/agents";
import { agentMessagesApi } from "@/api/agentMessages";
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

// ── Council messaging constants ─────────────────────────────────────────────
const COMPANY_ID = "af4ca647-81cb-4dc2-98f1-d54136391505";
const FROM_USER_ID = "julian@growthgod.com";

/** The 10 main archangels (excluding Azrael) available for council summons. */
const COUNCIL_AGENTS: { name: string; id: string }[] = [
  { name: "Cassiel",    id: "01c3cee8-da9e-4689-98d4-95fe6e9db9f8" },
  { name: "Uriel",     id: "1cab8b03-789b-435f-b132-e6ace1e38077" },
  { name: "Jophiel",   id: "cbb25fcb-b22a-4f2f-9a99-a7954072ee66" },
  { name: "Raziel",    id: "a6e4f405-ce0b-41fb-a7be-1e748b3a86aa" },
  { name: "Gabriel",   id: "dfedb8f1-c934-4651-8291-668504a63b35" },
  { name: "Metatron",  id: "34b4aa4b-7e04-42f4-9c15-0a99f7191ce1" },
  { name: "Zadkiel",   id: "ea3d1ec5-ee21-4662-9c2b-cc3ad39a2f9c" },
  { name: "Raphael",   id: "08f2f594-3573-4e6f-b643-20ae5377ca5c" },
  { name: "Sandalphon",id: "8fab7522-4545-463d-a5e4-6bffaa80bd1c" },
  { name: "Michael",   id: "85535ca2-0f31-41b2-bab1-618801945937" },
];

/** Rotating council summons prompts — round-robin per invocation. */
const COUNCIL_PROMPTS = [
  "What do you want to learn today?",
  "What are you working on right now?",
  "What needs your attention in the pipeline?",
  "Report your current status and next action.",
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

  // ── Task A: Council summons state ───────────────────────────────────────
  const [councilPending, setCouncilPending] = useState(false);
  const councilPromptIndexRef = useRef(0);

  /** Send a "request" message to every archangel in the council. */
  const invokeCouncil = async () => {
    if (councilPending) return;
    const companyId = selectedCompanyId ?? COMPANY_ID;
    setCouncilPending(true);
    try {
      const promptIndex = councilPromptIndexRef.current % COUNCIL_PROMPTS.length;
      councilPromptIndexRef.current += 1;
      const body = COUNCIL_PROMPTS[promptIndex]!;
      let dispatched = 0;
      for (const agent of COUNCIL_AGENTS) {
        await agentMessagesApi.send({
          companyId,
          fromUserId: FROM_USER_ID,
          toAgentId: agent.id,
          kind: "request",
          subject: "Council Summons",
          body,
        });
        dispatched += 1;
      }
      pushToast({
        tone: "success",
        title: "Council summoned",
        body: `Sent to ${dispatched} archangels: "${body}"`,
        ttlMs: 6000,
      });
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Council summons failed",
        body: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setCouncilPending(false);
    }
  };

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
          musicBackend: "minimax",
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
    setBreadcrumbs([{ label: "Hermetica" }]);
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
              Hermetica
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
          </div>
        </div>
        {/* Header actions:
            - "Consult the Council" opens the Angel Chamber ritual flow.
            - "Invoke the Council" broadcasts summons messages to all 10 archangels.
            - "Invoke the Spheres" batch-creates + auto-runs all mood presets.
            - "Begin Opus" opens the bare single-concept form. */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Task A: Invoke the Council — broadcast messages to all archangels */}
          <Button
            onClick={invokeCouncil}
            disabled={councilPending}
            size="sm"
            style={{
              backgroundColor: councilPending ? "rgba(139,92,246,0.3)" : "#7c3aed",
              color: "#FFFFFF",
              borderColor: "#a78bfa",
              boxShadow:
                "0 0 14px rgba(124,58,237,0.45), inset 0 0 10px rgba(167,139,250,0.15)",
              opacity: councilPending ? 0.7 : 1,
            }}
          >
            <Users className="h-4 w-4 mr-1" />
            {councilPending ? "Summoning…" : "Invoke the Council"}
          </Button>

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
            variant={showCreate ? "ghost" : "default"}
            style={
              showCreate
                ? { color: "#C0C0C0" }
                : {
                    backgroundColor: "#FFFFFF",
                    color: "#000000",
                    borderColor: "#C0C0C0",
                    boxShadow:
                      "0 0 12px rgba(255,255,255,0.35), inset 0 0 8px rgba(192,192,192,0.2)",
                  }
            }
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
                    setConceptDraft(preset.concept);
                    setChakraDraft(preset.targetChakra);
                    setGenreDraft(preset.genre);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    conceptDraft === preset.concept
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 bg-card/50 text-foreground hover:bg-accent hover:border-foreground/20",
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
              <div className="md:col-span-5 space-y-1.5">
                <Label htmlFor="suno-concept">Custom Concept</Label>
                <Input
                  id="suno-concept"
                  placeholder="type your own vibe…"
                  value={conceptDraft}
                  onChange={(e) => setConceptDraft(e.target.value)}
                />
              </div>
              <div className="md:col-span-3 space-y-1.5">
                <Label htmlFor="suno-chakra">Chakra</Label>
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
              <div className="md:col-span-3 space-y-1.5">
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

      <ChakraFrequencyMap issues={issues ?? []} />

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
}

function SunoColumn({ status, issues, agentNameById, onChangeStatus }: SunoColumnProps) {
  const opus = STATUS_OPUS_COLOR[status];
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
  const queryClient = useQueryClient();

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
        ref={setAudioRef}
        src={src}
        controls
        preload="none"
        className="h-6 flex-1 min-w-0"
        style={{ colorScheme: "dark" }}
      />
    </div>
  );
}
