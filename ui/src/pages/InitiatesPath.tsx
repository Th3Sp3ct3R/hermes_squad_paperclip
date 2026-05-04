/**
 * The Initiate's Path — three concentric tracks pulled from real lineage.
 *
 *   1. Magnum Opus per song (Nigredo → Albedo → Citrinitas → Rubedo)
 *   2. Golden Dawn grades 0=0 → 10=1, ascending the Tree of Life
 *   3. Archangelic Council sigils — one per agent + Solve et Coagula bonus
 *
 * Plus the Forge — a ritual form for declaring a new Opus, with a Da'ath-
 * gate emphasis on the empty Throat (741 Hz) chakra.
 *
 * Data comes from the live Suno Pipeline (issues + activity log + chakra
 * frequency map). When the Suno API is unreachable, falls back to a
 * sensible idle state.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import {
  sunoPipelineApi,
  type SunoChakra,
  type SunoIssue,
  type SunoStatus,
} from "@/api/sunoPipeline";

// ── Constants (port of the HTML spec, kept verbatim) ─────────────────

const STAGES = ["nigredo", "albedo", "citrinitas", "rubedo"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  nigredo: "NIGREDO",
  albedo: "ALBEDO",
  citrinitas: "CITRINITAS",
  rubedo: "RUBEDO",
};

const STAGE_AGENT: Record<Stage, string> = {
  nigredo: "raziel · seeds",
  albedo: "jophiel · uriel · zadkiel",
  citrinitas: "raphael · approves",
  rubedo: "sandalphon · published",
};

/** Map a sunoIssue.status → Magnum Opus stage. */
function statusToStage(status: SunoStatus): Stage {
  switch (status) {
    case "DRAFT":
      return "nigredo";
    case "GENERATING":
      return "albedo";
    case "REVIEW":
      return "citrinitas";
    case "APPROVED":
    case "PUBLISHED":
      return "rubedo";
    case "FAILED":
      return "nigredo";
    default:
      return "nigredo";
  }
}

const CHAKRAS = [
  { id: "ROOT" as SunoChakra, name: "Root", hz: "396 Hz", color: "#ef4444" },
  { id: "SACRAL" as SunoChakra, name: "Sacral", hz: "417 Hz", color: "#f97316" },
  { id: "SOLAR" as SunoChakra, name: "Solar", hz: "528 Hz", color: "#eab308" },
  { id: "HEART" as SunoChakra, name: "Heart", hz: "639 Hz", color: "#22c55e" },
  { id: "THROAT" as SunoChakra, name: "Throat", hz: "741 Hz", color: "#06b6d4" },
  { id: "THIRD_EYE" as SunoChakra, name: "Third Eye", hz: "852 Hz", color: "#6366f1" },
  { id: "CROWN" as SunoChakra, name: "Crown", hz: "963 Hz", color: "#a855f7" },
];

interface SummaryShape {
  songs: SunoIssue[];
  published: number;
  chakrasCovered: number;
  minChakraCount: number;
  throatChakraSongs: number;
  agentsShipped: number;
  solveCoagula: number;
  chakraCounts: Record<SunoChakra, number>;
  totalTracks: number;
}

const GRADES: Array<{
  num: string;
  name: string;
  seph: string;
  trig: string;
  rule: (s: SummaryShape) => boolean;
  daath?: boolean;
}> = [
  { num: "0=0", name: "Neophyte", seph: "—", trig: "first concept", rule: (s) => s.songs.length >= 1 },
  { num: "1=10", name: "Zelator", seph: "Malkuth", trig: "first publish", rule: (s) => s.published >= 1 },
  { num: "2=9", name: "Theoricus", seph: "Yesod", trig: "5 published", rule: (s) => s.published >= 5 },
  { num: "3=8", name: "Practicus", seph: "Hod", trig: "all 10 agents", rule: (s) => s.agentsShipped >= 10 },
  { num: "4=7", name: "Philosophus", seph: "Netzach", trig: "10 pub · 4+ chakras", rule: (s) => s.published >= 10 && s.chakrasCovered >= 4 },
  { num: "—", name: "Crossing the Abyss", seph: "Da'ath", trig: "throat · 1 song", rule: (s) => s.throatChakraSongs >= 1, daath: true },
  { num: "5=6", name: "Adeptus Minor", seph: "Tiphareth", trig: "all 7 chakras", rule: (s) => s.chakrasCovered >= 7 },
  { num: "6=5", name: "Adeptus Major", seph: "Geburah", trig: "rejected→reworked", rule: (s) => s.solveCoagula >= 1 },
  { num: "7=4", name: "Adeptus Exemptus", seph: "Chesed", trig: "25 published", rule: (s) => s.published >= 25 },
  { num: "8=3", name: "Magister Templi", seph: "Binah", trig: "50 songs", rule: (s) => s.published >= 50 },
  { num: "9=2", name: "Magus", seph: "Chokmah", trig: "100 songs", rule: (s) => s.published >= 100 },
  { num: "10=1", name: "Ipsissimus", seph: "Kether", trig: "every chakra ≥7", rule: (s) => s.minChakraCount >= 7 },
];

const TREE = [
  { id: "kether", x: 100, y: 30, r: 14, key: "10=1" },
  { id: "chokmah", x: 155, y: 70, r: 13, key: "9=2" },
  { id: "binah", x: 45, y: 70, r: 13, key: "8=3" },
  { id: "daath", x: 100, y: 115, r: 11, key: "daath" },
  { id: "chesed", x: 155, y: 155, r: 13, key: "7=4" },
  { id: "geburah", x: 45, y: 155, r: 13, key: "6=5" },
  { id: "tiphareth", x: 100, y: 200, r: 14, key: "5=6" },
  { id: "netzach", x: 155, y: 240, r: 13, key: "4=7" },
  { id: "hod", x: 45, y: 240, r: 13, key: "3=8" },
  { id: "yesod", x: 100, y: 285, r: 13, key: "2=9" },
  { id: "malkuth", x: 100, y: 330, r: 14, key: "1=10" },
];

const TREE_PATHS: Array<[string, string]> = [
  ["kether", "chokmah"], ["kether", "binah"], ["chokmah", "binah"],
  ["chokmah", "tiphareth"], ["binah", "tiphareth"], ["kether", "tiphareth"],
  ["chokmah", "chesed"], ["binah", "geburah"], ["chesed", "geburah"],
  ["chesed", "tiphareth"], ["geburah", "tiphareth"], ["chesed", "netzach"],
  ["geburah", "hod"], ["tiphareth", "netzach"], ["tiphareth", "hod"],
  ["netzach", "hod"], ["netzach", "yesod"], ["hod", "yesod"],
  ["tiphareth", "yesod"], ["netzach", "malkuth"], ["hod", "malkuth"],
  ["yesod", "malkuth"],
];

const TREE_LABELS: Record<string, string> = {
  kether: "KETHER", chokmah: "CHOKMAH", binah: "BINAH", daath: "DA'ATH",
  chesed: "CHESED", geburah: "GEBURAH", tiphareth: "TIPHARETH",
  netzach: "NETZACH", hod: "HOD", yesod: "YESOD", malkuth: "MALKUTH",
};

const SIGILS: Array<{ key: string; name: string; desc: string; tier: string; bonus?: boolean }> = [
  { key: "hermes", name: "Hermes' Errand", desc: "first message routed by orchestrator", tier: "COURIER" },
  { key: "michael", name: "Michael's Dispatch", desc: "first creative assignment dispatched", tier: "COMMANDER" },
  { key: "raziel", name: "Raziel's Seed", desc: "first audio generated · prima materia", tier: "KEEPER" },
  { key: "jophiel", name: "Jophiel's Mirror", desc: "first cover art rendered", tier: "ARTIST" },
  { key: "zadkiel", name: "Zadkiel's Verse", desc: "first lyric written", tier: "SCRIBE" },
  { key: "uriel", name: "Uriel's Foundation", desc: "first sound prompt established", tier: "BUILDER" },
  { key: "raphael", name: "Raphael's Blessing", desc: "first approval · peacock's tail", tier: "HEALER" },
  { key: "gabriel", name: "Gabriel's Annunciation", desc: "first release copy delivered", tier: "HERALD" },
  { key: "sandalphon", name: "Sandalphon's Garland", desc: "first publish · the stone cast", tier: "CROWN" },
  { key: "metatron", name: "Metatron's Ledger", desc: "1000 timeline events recorded", tier: "SCRIBE" },
  { key: "solve", name: "Solve et Coagula", desc: "rejected song reworked to approval", tier: "BONUS", bonus: true },
];

function summarize(songs: SunoIssue[]): SummaryShape {
  const published = songs.filter((s) => s.status === "PUBLISHED" || s.status === "APPROVED").length;
  const chakraCounts: Record<SunoChakra, number> = {
    ROOT: 0, SACRAL: 0, SOLAR: 0, HEART: 0, THROAT: 0, THIRD_EYE: 0, CROWN: 0,
  };
  for (const s of songs) {
    if (s.targetChakra && s.targetChakra in chakraCounts) {
      chakraCounts[s.targetChakra as SunoChakra] += 1;
    }
  }
  const vals = CHAKRAS.map((c) => chakraCounts[c.id] ?? 0);
  // Heuristic: count agents that have shipped by checking whether each
  // pipeline stage has produced output across the visible song set.
  const stageOutputs = {
    raziel: songs.some((s) => s.audioUrl || s.minimaxAudioUrl),
    jophiel: songs.some((s) => s.thumbnailUrl),
    uriel: songs.some(
      (s) =>
        typeof (s.metadata as Record<string, unknown> | null)?.["stages"] === "object" &&
        ((s.metadata as Record<string, unknown>)["stages"] as Record<string, unknown>)?.["soundPrompt"],
    ),
    zadkiel: songs.some(
      (s) =>
        typeof (s.metadata as Record<string, unknown> | null)?.["stages"] === "object" &&
        ((s.metadata as Record<string, unknown>)["stages"] as Record<string, unknown>)?.["lyrics"],
    ),
    raphael: songs.some((s) => s.status === "APPROVED" || s.status === "PUBLISHED"),
    sandalphon: songs.some((s) => s.status === "PUBLISHED"),
    gabriel: songs.some(
      (s) =>
        typeof (s.metadata as Record<string, unknown> | null)?.["stages"] === "object" &&
        ((s.metadata as Record<string, unknown>)["stages"] as Record<string, unknown>)?.["releaseCopy"],
    ),
    metatron: songs.length > 0,
    michael: songs.some((s) => s.status !== "DRAFT"),
    hermes: songs.length > 0,
  };
  const agentsShipped = Object.values(stageOutputs).filter(Boolean).length;
  return {
    songs,
    published,
    chakrasCovered: vals.filter((v) => v > 0).length,
    minChakraCount: vals.length ? Math.min(...vals) : 0,
    throatChakraSongs: chakraCounts.THROAT,
    agentsShipped,
    solveCoagula: 0, // TODO wire to activity log when needed
    chakraCounts,
    totalTracks: songs.length,
  };
}

// ── Page component ──────────────────────────────────────────────────

export default function InitiatesPath() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "The Initiate's Path" }]);
  }, [setBreadcrumbs]);

  const { data: songs } = useQuery({
    queryKey: ["suno-pipeline", selectedCompanyId, "initiate"],
    queryFn: () => sunoPipelineApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const [fTitle, setFTitle] = useState("");
  const [fIntent, setFIntent] = useState("");
  const [fChakra, setFChakra] = useState<SunoChakra>("THROAT");

  const sum = useMemo(() => summarize(songs ?? []), [songs]);
  const grades = useMemo(() => GRADES.filter((g) => g.rule(sum)), [sum]);
  const currentGrade = grades[grades.length - 1] ?? GRADES[0]!;

  const forgeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("no company");
      return sunoPipelineApi.create(selectedCompanyId, {
        concept: fTitle + (fIntent ? `\n\n${fIntent}` : ""),
        targetChakra: fChakra,
        genre: "instrumental, ambient, alchemical",
      });
    },
    onSuccess: () => {
      setFTitle("");
      setFIntent("");
      setFChakra("THROAT");
      queryClient.invalidateQueries({
        queryKey: ["suno-pipeline", selectedCompanyId, "initiate"],
      });
    },
  });

  const totalTracks = sum.totalTracks;
  const totalMinutes = totalTracks * 3.5;

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view the Initiate's Path.
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-8"
      style={{
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "Geist, system-ui, sans-serif",
      }}
    >
      {/* Background gradient overlays — purple top-left, gold bottom-right */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 800px 400px at 0% 0%, rgba(192,132,252,0.05), transparent 60%), radial-gradient(ellipse 600px 300px at 100% 100%, rgba(201,164,73,0.04), transparent 60%)",
          zIndex: 0,
        }}
      />
      <div className="relative max-w-[1400px] mx-auto" style={{ zIndex: 1 }}>
        {/* HEADER */}
        <Header
          songs={totalTracks}
          gradeName={currentGrade.name.split(" ")[0]!}
          sigilCount={countSigils(sum)}
          subText={`subagent fleet · ${totalTracks} songs · ${sum.agentsShipped}/10 agents shipped · ${sum.published} published`}
        />

        {/* HERO STATS */}
        <HeroStats sum={sum} grades={grades} currentGrade={currentGrade} />

        {/* CHAKRA TUNING */}
        <ChakraTuning
          counts={sum.chakraCounts}
          totalTracks={totalTracks}
          totalMinutes={totalMinutes}
        />

        {/* FORGE */}
        <Forge
          title={fTitle}
          setTitle={setFTitle}
          intent={fIntent}
          setIntent={setFIntent}
          chakra={fChakra}
          setChakra={setFChakra}
          onSubmit={() => forgeMutation.mutate()}
          submitting={forgeMutation.isPending}
        />

        {/* TWO COLUMN: OPUS + TREE */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <MagnumOpusPanel songs={sum.songs} />
          <AscendingTreePanel grades={grades} currentGrade={currentGrade} />
        </div>

        {/* SIGILS */}
        <SigilsPanel sum={sum} />
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function Header({
  songs,
  gradeName,
  sigilCount,
  subText,
}: {
  songs: number;
  gradeName: string;
  sigilCount: number;
  subText: string;
}) {
  return (
    <div
      className="grid grid-cols-[1fr_auto] gap-8 items-end p-7 mb-4 rounded relative overflow-hidden"
      style={{
        border: "1px solid rgba(201,164,73,0.25)",
        background: "#0a0a0a",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, #c9a449, transparent)",
        }}
      />
      <div>
        <div
          className="font-mono text-[10px] tracking-[0.2em] uppercase mb-2.5 flex items-center gap-2"
          style={{ color: "#c9a449" }}
        >
          <span
            style={{
              width: 3,
              height: 11,
              background: "#c9a449",
              borderRadius: 1,
              display: "inline-block",
            }}
          />
          THE INITIATE'S PATH · ACHIEVEMENT SYSTEM
        </div>
        <h1
          className="text-[30px] leading-[1.15] tracking-[0.04em] font-medium"
          style={{ fontFamily: "Cinzel, serif" }}
        >
          Three concentric tracks{" "}
          <em
            className="not-italic"
            style={{
              fontFamily: "EB Garamond, serif",
              fontStyle: "italic",
              fontWeight: 400,
              color: "#e8c46a",
              letterSpacing: 0,
            }}
          >
            pulled from real lineage
          </em>
        </h1>
        <div
          className="font-mono text-[11px] tracking-[0.05em] mt-3"
          style={{ color: "#6a6a6a" }}
        >
          {subText}
        </div>
      </div>
      <div className="flex gap-9 items-end">
        <HStat num={gradeName} numColor="#e8c46a" lbl="CURRENT GRADE" />
        <HStat num={String(songs)} lbl="SONGS" />
        <HStat num={`${sigilCount}`} lbl="SIGILS · 11" />
      </div>
    </div>
  );
}

function HStat({
  num,
  numColor,
  lbl,
}: {
  num: string;
  numColor?: string;
  lbl: string;
}) {
  return (
    <div>
      <div className="text-xl font-medium" style={{ color: numColor ?? "#fff" }}>
        {num}
      </div>
      <div
        className="font-mono text-[9px] tracking-[0.18em] uppercase mt-0.5"
        style={{ color: "#6a6a6a" }}
      >
        {lbl}
      </div>
    </div>
  );
}

function HeroStats({
  sum,
  grades,
  currentGrade,
}: {
  sum: SummaryShape;
  grades: typeof GRADES;
  currentGrade: (typeof GRADES)[number];
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <StatCard
        label="GRADE · SEPHIRAH"
        big={currentGrade.name}
        bigColor="#e8c46a"
        bigSize={28}
        sub={
          <span style={{ color: "#c9a449" }}>
            {currentGrade.num} · {currentGrade.seph}
          </span>
        }
        borderGold
      />
      <StatCard
        label="MAGNUM OPERA · COMPLETED"
        big={
          <>
            {sum.published}
            <span className="text-sm ml-1" style={{ color: "#6a6a6a" }}>
              / {sum.songs.length}
            </span>
          </>
        }
        bigColor="#10b981"
        sub={`${sum.songs.length - sum.published} in progress`}
      />
      <StatCard
        label="CHAKRA COVERAGE"
        big={
          <>
            {sum.chakrasCovered}
            <span className="text-sm ml-1" style={{ color: "#6a6a6a" }}>
              / 7
            </span>
          </>
        }
        bigColor="#c084fc"
        sub={`${grades.length} sephiroth lit`}
      />
      <StatCard
        label="DA'ATH GATE · THROAT 741HZ"
        big={
          <>
            {sum.throatChakraSongs}
            <span className="text-sm ml-1" style={{ color: "#6a6a6a" }}>
              songs
            </span>
          </>
        }
        bigColor="#ef4444"
        sub={
          sum.throatChakraSongs > 0
            ? "gate crossed ✦"
            : "gate sealed · da'ath awaits"
        }
        gate
      />
    </div>
  );
}

function StatCard({
  label,
  big,
  bigColor,
  bigSize = 36,
  sub,
  borderGold,
  gate,
}: {
  label: string;
  big: React.ReactNode;
  bigColor?: string;
  bigSize?: number;
  sub: React.ReactNode;
  borderGold?: boolean;
  gate?: boolean;
}) {
  return (
    <div
      className="rounded p-5"
      style={{
        border: borderGold
          ? "1px solid rgba(201,164,73,0.25)"
          : gate
            ? "1px solid rgba(239,68,68,0.4)"
            : "1px solid rgba(255,255,255,0.08)",
        background: gate
          ? "linear-gradient(180deg, rgba(239,68,68,0.06), #0a0a0a)"
          : "#0a0a0a",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.2em] uppercase mb-3.5 flex items-center gap-2"
        style={{ color: "#6a6a6a" }}
      >
        <span
          style={{
            width: 3,
            height: 11,
            background: borderGold ? "#c9a449" : gate ? "#ef4444" : "#6a6a6a",
            borderRadius: 1,
            display: "inline-block",
          }}
        />
        {label}
      </div>
      <div
        style={{
          fontSize: bigSize,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: bigColor ?? "#fff",
        }}
      >
        {big}
      </div>
      <div
        className="font-mono text-[10px] tracking-[0.1em] uppercase mt-2"
        style={{ color: "#6a6a6a" }}
      >
        {sub}
      </div>
    </div>
  );
}

function ChakraTuning({
  counts,
  totalTracks,
  totalMinutes,
}: {
  counts: Record<SunoChakra, number>;
  totalTracks: number;
  totalMinutes: number;
}) {
  return (
    <Section
      title="CHAKRA TUNING"
      subtitle="SOLFEGGIO COVERAGE"
      meta={
        <>
          <strong style={{ color: "#fff" }}>{totalTracks}</strong> TRACKS ·{" "}
          {Math.round(totalMinutes)} min GENERATED
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 p-5">
        {CHAKRAS.map((c) => {
          const v = counts[c.id] ?? 0;
          const empty = v === 0;
          const status = empty
            ? "sealed"
            : v >= 5
              ? "flowing"
              : v >= 2
                ? "open"
                : "stirring";
          return (
            <div
              key={c.id}
              className="rounded p-3.5 relative overflow-hidden"
              style={{
                border: empty
                  ? "1px solid rgba(239,68,68,0.35)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: empty
                  ? "linear-gradient(180deg, rgba(239,68,68,0.04), #111)"
                  : "#111",
              }}
            >
              {empty && (
                <span
                  className="absolute top-2 right-2.5 font-mono text-[8px] tracking-[0.2em] px-1.5 py-0.5 rounded"
                  style={{
                    color: "#ef4444",
                    background: "rgba(239,68,68,0.1)",
                  }}
                >
                  DA'ATH
                </span>
              )}
              <div
                className="font-mono text-[9px] tracking-[0.18em] uppercase flex items-center gap-1.5"
                style={{ color: "#6a6a6a" }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.color,
                    display: "inline-block",
                  }}
                />
                {c.name}
              </div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: "#6a6a6a" }}>
                {c.hz}
              </div>
              <div
                className="text-[22px] font-medium leading-none mt-2"
                style={{ color: empty ? "#ef4444" : c.color }}
              >
                {v}
                <span className="text-[11px] font-mono ml-1" style={{ color: "#6a6a6a" }}>
                  tracks
                </span>
              </div>
              <div
                className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1.5"
                style={{ color: "#6a6a6a" }}
              >
                {status}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Forge({
  title,
  setTitle,
  intent,
  setIntent,
  chakra,
  setChakra,
  onSubmit,
  submitting,
}: {
  title: string;
  setTitle: (s: string) => void;
  intent: string;
  setIntent: (s: string) => void;
  chakra: SunoChakra;
  setChakra: (c: SunoChakra) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Section
      title="FORGE A NEW OPUS"
      subtitle="CREATE SONG GOAL"
      meta="RAZIEL AWAITS · NIGREDO INITIATION"
      goldEdge
    >
      <div className="grid lg:grid-cols-[1fr_360px] gap-8 p-6 items-start">
        <div>
          <p
            className="text-base mb-5 max-w-md"
            style={{
              fontFamily: "EB Garamond, serif",
              fontStyle: "italic",
              color: "#a3a3a3",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: "#c9a449", fontStyle: "normal" }}>✦ </span>
            Name the work, declare its frequency, set the intention. Raziel will
            seed the prima materia and the council will carry it through to the
            Stone.
          </p>
          <form
            className="flex flex-col gap-3.5 max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && !submitting) onSubmit();
            }}
          >
            <FieldRow label="Title">
              <input
                type="text"
                className="w-full rounded-sm px-3 py-2.5 text-[13px] focus:outline-none"
                style={{
                  background: "#111",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontFamily: "Geist, sans-serif",
                }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Throat of the Hidden Sephirah"
                required
              />
            </FieldRow>
            <FieldRow label="Target Chakra">
              <div className="flex flex-wrap gap-1.5">
                {CHAKRAS.map((c) => {
                  const active = chakra === c.id;
                  const isThroat = c.id === "THROAT";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setChakra(c.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm cursor-pointer transition-all font-mono text-[10px] tracking-[0.1em] uppercase"
                      style={{
                        border: active
                          ? `1px solid ${c.color}`
                          : isThroat
                            ? "1px solid #ef4444"
                            : "1px solid rgba(255,255,255,0.08)",
                        background: active ? "rgba(255,255,255,0.04)" : "#111",
                        color: isThroat && !active ? "#ef4444" : c.color,
                        boxShadow: isThroat && !active
                          ? "0 0 12px rgba(239,68,68,0.5)"
                          : undefined,
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: c.color,
                          display: "inline-block",
                        }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </FieldRow>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Set the intention — what does this song dissolve, illuminate, or coagulate?"
              rows={3}
              className="w-full rounded-sm px-3 py-2.5 text-[15px] focus:outline-none italic"
              style={{
                background: "#111",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
                fontFamily: "EB Garamond, serif",
                lineHeight: 1.5,
              }}
            />
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="self-start px-6 py-3 cursor-pointer rounded-sm font-semibold disabled:opacity-50 transition-all"
              style={{
                background:
                  "linear-gradient(180deg, #e8c46a, #c9a449)",
                color: "#000",
                fontFamily: "Cinzel, serif",
                fontSize: 13,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                border: "none",
                boxShadow: "0 4px 16px rgba(201,164,73,0.2)",
              }}
            >
              {submitting ? "✦ Initiating…" : "✦ Initiate the Work"}
            </button>
          </form>
        </div>
        <div
          className="lg:border-l lg:pl-8"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <h3
            className="mb-3 font-medium"
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: 14,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#c9a449",
            }}
          >
            The Four Stages
          </h3>
          <StageRef name="NIGREDO" agent="Raziel seeds the prima materia." color="#6a6a6a" dotBg="#000" />
          <StageRef name="ALBEDO" agent="Jophiel, Uriel, Zadkiel deposit the work." color="#fff" dotBg="#d4c8b0" />
          <StageRef name="CITRINITAS" agent="Raphael approves — the peacock's tail." color="#f59e0b" dotBg="#f59e0b" />
          <StageRef name="RUBEDO" agent="Sandalphon publishes — the Stone." color="#ef4444" dotBg="#ef4444" />
        </div>
      </div>
    </Section>
  );
}

function StageRef({
  name,
  agent,
  color,
  dotBg,
}: {
  name: string;
  agent: string;
  color: string;
  dotBg: string;
}) {
  return (
    <div
      className="grid gap-3 items-start py-2 border-b border-dashed last:border-0"
      style={{
        gridTemplateColumns: "16px 1fr",
        borderColor: "rgba(255,255,255,0.08)",
        color,
      }}
    >
      <span
        className="mt-1 inline-block rounded-full"
        style={{
          width: 12,
          height: 12,
          background: dotBg,
          border: `1.5px solid ${color}`,
        }}
      />
      <div>
        <div style={{ fontFamily: "Cinzel, serif", fontSize: 12, letterSpacing: "0.1em" }}>
          {name}
        </div>
        <div
          style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontSize: 13,
            color: "#6a6a6a",
          }}
        >
          {agent}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 items-center">
      <div
        className="font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "#6a6a6a" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function MagnumOpusPanel({ songs }: { songs: SunoIssue[] }) {
  return (
    <Section
      title="MAGNUM OPUS"
      subtitle="PER-SONG GREAT WORK"
      meta="4 STAGES · NIGREDO → RUBEDO"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
        {songs.length === 0 ? (
          <div
            className="col-span-full text-center py-10 font-mono text-[11px] tracking-[0.1em]"
            style={{ color: "#6a6a6a" }}
          >
            no songs · awaiting prima materia
          </div>
        ) : (
          songs.slice(0, 12).map((s) => {
            const stage = statusToStage(s.status);
            const idx = STAGES.indexOf(stage);
            return (
              <div
                key={s.id}
                className="rounded p-3.5"
                style={{
                  border:
                    stage === "rubedo"
                      ? "1px solid rgba(201,164,73,0.35)"
                      : "1px solid rgba(255,255,255,0.08)",
                  background:
                    stage === "rubedo"
                      ? "linear-gradient(180deg, rgba(201,164,73,0.05), #111)"
                      : "#111",
                  position: "relative",
                }}
              >
                {stage === "rubedo" && (
                  <span
                    className="absolute top-2.5 right-2.5"
                    style={{ color: "#c9a449", opacity: 0.8, fontSize: 14 }}
                  >
                    ✦
                  </span>
                )}
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div>
                    <div
                      style={{
                        fontFamily: "Cinzel, serif",
                        fontSize: 14,
                        fontWeight: 500,
                        lineHeight: 1.3,
                      }}
                    >
                      {s.concept.slice(0, 60)}
                    </div>
                    <div
                      className="font-mono text-[9px] tracking-[0.15em] uppercase mt-1"
                      style={{ color: "#6a6a6a" }}
                    >
                      {(s.targetChakra ?? "").toLowerCase().replace("_", " ")} chakra
                    </div>
                  </div>
                  <div
                    className="font-mono text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm whitespace-nowrap"
                    style={{
                      color:
                        stage === "rubedo"
                          ? "#e8c46a"
                          : stage === "citrinitas"
                            ? "#f59e0b"
                            : stage === "albedo"
                              ? "#3b82f6"
                              : "#6a6a6a",
                      background:
                        stage === "rubedo"
                          ? "rgba(201,164,73,0.12)"
                          : stage === "citrinitas"
                            ? "rgba(245,158,11,0.1)"
                            : stage === "albedo"
                              ? "rgba(59,130,246,0.1)"
                              : "rgba(255,255,255,0.05)",
                    }}
                  >
                    {STAGE_LABELS[stage]}
                  </div>
                </div>
                <div className="flex gap-1 mb-2.5">
                  {STAGES.map((st, i) => {
                    const on = i <= idx;
                    return (
                      <div
                        key={st}
                        className="flex-1 h-[3px] rounded-sm"
                        style={{
                          background: on
                            ? st === "rubedo"
                              ? "#c9a449"
                              : st === "citrinitas"
                                ? "#f59e0b"
                                : st === "albedo"
                                  ? "#3b82f6"
                                  : "#a3a3a3"
                            : "rgba(255,255,255,0.08)",
                          boxShadow: on && st === "rubedo" ? "0 0 8px #c9a449" : undefined,
                        }}
                      />
                    );
                  })}
                </div>
                <div
                  className="flex justify-between font-mono text-[8px] tracking-[0.15em] uppercase"
                  style={{ color: "#404040" }}
                >
                  {STAGES.map((st) => (
                    <span
                      key={st}
                      style={{ color: st === stage ? "#fff" : "#404040" }}
                    >
                      {STAGE_LABELS[st]}
                    </span>
                  ))}
                </div>
                <div
                  className="mt-2.5 pt-2.5 font-mono text-[10px] flex justify-between"
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    color: "#6a6a6a",
                  }}
                >
                  <span style={{ color: "#a3a3a3" }}>{STAGE_AGENT[stage]}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}

function AscendingTreePanel({
  grades,
  currentGrade,
}: {
  grades: typeof GRADES;
  currentGrade: (typeof GRADES)[number];
}) {
  const unlocked = new Set(grades.map((g) => (g.daath ? "daath" : g.num)));
  return (
    <Section
      title="ASCENDING THE TREE"
      subtitle="GOLDEN DAWN GRADES"
      meta={
        <>
          <strong style={{ color: "#fff" }}>{unlocked.size}</strong> / 12 ATTAINED
        </>
      }
    >
      <div
        className="grid gap-6 p-5"
        style={{ gridTemplateColumns: "200px 1fr" }}
      >
        <svg viewBox="0 0 200 360" className="w-full h-auto">
          {TREE_PATHS.map(([a, b], i) => {
            const A = TREE.find((x) => x.id === a)!;
            const B = TREE.find((x) => x.id === b)!;
            const lit = unlocked.has(A.key) && unlocked.has(B.key);
            return (
              <line
                key={i}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={lit ? "#c9a449" : "rgba(255,255,255,0.08)"}
                strokeWidth={lit ? 1 : 0.8}
                opacity={lit ? 0.6 : 1}
                fill="none"
              />
            );
          })}
          {TREE.map((s) => {
            const u = unlocked.has(s.key);
            const isCur = currentGrade.daath
              ? s.id === "daath"
              : currentGrade.num === s.key;
            const isDaath = s.id === "daath";
            const fill = isCur
              ? "#c9a449"
              : isDaath && u
                ? "#ef4444"
                : isDaath
                  ? "rgba(239,68,68,0.08)"
                  : u
                    ? "rgba(201,164,73,0.18)"
                    : "#111";
            const stroke = isCur
              ? "#e8c46a"
              : isDaath && u
                ? "#f87171"
                : isDaath
                  ? "#ef4444"
                  : u
                    ? "#c9a449"
                    : "rgba(255,255,255,0.16)";
            return (
              <g key={s.id}>
                <circle
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isCur ? 2 : 1}
                  strokeDasharray={isDaath && !u ? "2 2" : undefined}
                  filter={
                    isCur
                      ? "drop-shadow(0 0 8px #c9a449)"
                      : isDaath && u
                        ? "drop-shadow(0 0 8px #ef4444)"
                        : undefined
                  }
                />
                <text
                  x={s.x}
                  y={s.y + s.r + 10}
                  fill={isCur || u ? "#fff" : "#6a6a6a"}
                  fontFamily="Geist Mono, monospace"
                  fontSize="7"
                  textAnchor="middle"
                  style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}
                >
                  {TREE_LABELS[s.id]}
                </text>
              </g>
            );
          })}
        </svg>
        <div
          className="flex flex-col max-h-[480px] overflow-y-auto"
          style={{ paddingRight: 4 }}
        >
          {GRADES.map((g) => {
            const k = g.daath ? "daath" : g.num;
            const u = unlocked.has(k);
            const isCur = currentGrade.daath ? g.daath : currentGrade.num === g.num;
            return (
              <div
                key={g.num + g.name}
                className="grid gap-3 items-center py-2.5"
                style={{
                  gridTemplateColumns: "50px 1fr 95px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: g.daath
                    ? u
                      ? "linear-gradient(90deg, rgba(239,68,68,0.12), transparent)"
                      : "linear-gradient(90deg, rgba(239,68,68,0.05), transparent)"
                    : undefined,
                  margin: g.daath ? "4px -8px" : undefined,
                  padding: g.daath ? "12px 8px" : undefined,
                  borderRadius: g.daath ? 2 : undefined,
                }}
              >
                <div
                  className="font-mono text-[11px] tracking-[0.05em]"
                  style={{
                    color: g.daath
                      ? "#ef4444"
                      : isCur
                        ? "#e8c46a"
                        : u
                          ? "#c9a449"
                          : "#6a6a6a",
                    fontWeight: isCur ? 500 : 400,
                  }}
                >
                  {g.num}
                </div>
                <div
                  style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: g.daath
                      ? u
                        ? "#f87171"
                        : "#ef4444"
                      : u || isCur
                        ? "#fff"
                        : "#6a6a6a",
                    letterSpacing: "0.03em",
                  }}
                >
                  {g.name}
                  <span
                    className="block font-mono text-[10px] tracking-[0.1em] uppercase mt-0.5"
                    style={{
                      color: g.daath ? "#ef4444" : u ? "#6a6a6a" : "#404040",
                      fontWeight: 400,
                    }}
                  >
                    {g.seph}
                  </span>
                </div>
                <div
                  className="font-mono text-[9px] tracking-[0.05em] text-right leading-snug"
                  style={{
                    color: g.daath
                      ? "#ef4444"
                      : isCur
                        ? "#e8c46a"
                        : u
                          ? "#6a6a6a"
                          : "#404040",
                  }}
                >
                  {u ? "✦ ATTAINED" : g.trig}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function countSigils(sum: SummaryShape): number {
  return SIGILS.filter((sig) => isSigilEarned(sig, sum)).length;
}

function isSigilEarned(
  sig: (typeof SIGILS)[number],
  sum: SummaryShape,
): boolean {
  // Heuristic mapping; ties to the same checks summarize() uses for agentsShipped
  const songs = sum.songs;
  switch (sig.key) {
    case "hermes":
    case "metatron":
      return songs.length > 0;
    case "michael":
      return songs.some((s) => s.status !== "DRAFT");
    case "raziel":
      return songs.some((s) => s.audioUrl || s.minimaxAudioUrl);
    case "jophiel":
      return songs.some((s) => s.thumbnailUrl);
    case "uriel":
      return songs.some((s) => stageHas(s, "soundPrompt"));
    case "zadkiel":
      return songs.some((s) => stageHas(s, "lyrics"));
    case "raphael":
      return songs.some((s) => s.status === "APPROVED" || s.status === "PUBLISHED");
    case "gabriel":
      return songs.some((s) => stageHas(s, "releaseCopy"));
    case "sandalphon":
      return songs.some((s) => s.status === "PUBLISHED");
    case "solve":
      return sum.solveCoagula >= 1;
    default:
      return false;
  }
}

function stageHas(issue: SunoIssue, key: string): boolean {
  const meta = (issue.metadata ?? {}) as Record<string, unknown>;
  const stages = (typeof meta.stages === "object" && meta.stages !== null
    ? (meta.stages as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  return Boolean(stages[key]);
}

function SigilsPanel({ sum }: { sum: SummaryShape }) {
  const earnedCount = SIGILS.filter((s) => isSigilEarned(s, sum)).length;
  const dormant = SIGILS.length - earnedCount;
  return (
    <Section
      title="ARCHANGELIC COUNCIL"
      subtitle="AGENT SIGILS"
      meta={
        <>
          <strong style={{ color: "#fff" }}>{earnedCount}</strong> EARNED ·{" "}
          {dormant} DORMANT
        </>
      }
    >
      <div className="py-2">
        {SIGILS.map((sig) => {
          const earned = isSigilEarned(sig, sum);
          return (
            <div
              key={sig.key}
              className="grid gap-3.5 items-center px-5 py-3 hover:bg-white/[0.02] transition-colors"
              style={{
                gridTemplateColumns: "44px 1fr auto auto",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                className="w-10 h-10 rounded grid place-items-center"
                style={{
                  border:
                    earned && sig.bonus
                      ? "1px solid #ef4444"
                      : earned
                        ? "1px solid #c9a449"
                        : "1px solid rgba(255,255,255,0.16)",
                  background:
                    earned && sig.bonus
                      ? "rgba(239,68,68,0.08)"
                      : earned
                        ? "rgba(201,164,73,0.08)"
                        : "#111",
                }}
              >
                <SigilIcon
                  k={sig.key}
                  color={earned ? (sig.bonus ? "#f87171" : "#e8c46a") : "#6a6a6a"}
                />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: 13,
                    fontWeight: 500,
                    color: earned ? "#fff" : "#6a6a6a",
                    letterSpacing: "0.04em",
                  }}
                >
                  {sig.name}
                </div>
                <div
                  className="mt-0.5"
                  style={{
                    fontFamily: "EB Garamond, serif",
                    fontStyle: "italic",
                    fontSize: 13,
                    color: "#6a6a6a",
                  }}
                >
                  {sig.desc}
                </div>
              </div>
              <div
                className="font-mono text-[9px] tracking-[0.2em] uppercase text-right"
                style={{
                  color:
                    earned && sig.bonus
                      ? "#ef4444"
                      : earned
                        ? "#c9a449"
                        : "#404040",
                }}
              >
                {sig.tier}
              </div>
              <div
                className="font-mono text-[9px] tracking-[0.1em] uppercase"
                style={{ color: "#404040" }}
              >
                {earned ? "EARNED" : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function SigilIcon({ k, color }: { k: string; color: string }) {
  const props = {
    width: 20,
    height: 20,
    fill: "none",
    stroke: color,
    strokeWidth: 1.5,
  };
  switch (k) {
    case "hermes":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
        </svg>
      );
    case "michael":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" />
        </svg>
      );
    case "raziel":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="9" cy="12" r="6" />
          <circle cx="15" cy="12" r="6" />
        </svg>
      );
    case "jophiel":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,12 12,22 2,12" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "zadkiel":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M5 4h14v16H5z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </svg>
      );
    case "uriel":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <path d="M3 8l9 5 9-5" />
        </svg>
      );
    case "raphael":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <polyline points="9,12 11,14 15,10" />
        </svg>
      );
    case "gabriel":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,9 18,21 6,21 2,9" />
          <path d="M2 9l10 5 10-5" />
        </svg>
      );
    case "sandalphon":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" />
          <polygon points="12,7 17,10 17,14 12,17 7,14 7,10" />
        </svg>
      );
    case "metatron":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <circle cx="6" cy="9" r="2" />
          <circle cx="18" cy="9" r="2" />
          <circle cx="6" cy="15" r="2" />
          <circle cx="18" cy="15" r="2" />
        </svg>
      );
    case "solve":
      return (
        <svg viewBox="0 0 24 24" {...props}>
          <path d="M3 12c4-9 14-9 18 0M3 12c4 9 14 9 18 0" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    default:
      return null;
  }
}

function Section({
  title,
  subtitle,
  meta,
  goldEdge,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: React.ReactNode;
  goldEdge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded mb-4"
      style={{
        border: goldEdge
          ? "1px solid rgba(201,164,73,0.25)"
          : "1px solid rgba(255,255,255,0.08)",
        background: "#0a0a0a",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div
          className="flex items-center gap-2.5 font-mono text-[11px] tracking-[0.15em] uppercase"
          style={{ color: "#a3a3a3" }}
        >
          <span
            style={{
              width: 3,
              height: 14,
              background: goldEdge ? "#c9a449" : "#a3a3a3",
              borderRadius: 1,
              display: "inline-block",
            }}
          />
          <strong style={{ color: "#fff", fontWeight: 500 }}>{title}</strong>
          {subtitle && (
            <>
              <span style={{ color: "#404040" }}>·</span>
              <span>{subtitle}</span>
            </>
          )}
        </div>
        {meta && (
          <div
            className="font-mono text-[11px] tracking-[0.1em] uppercase flex items-center gap-2"
            style={{ color: "#6a6a6a" }}
          >
            {meta}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
