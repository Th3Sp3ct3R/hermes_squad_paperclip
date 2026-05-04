/**
 * ChakraFrequencyMap — at-a-glance overview of how the Suno catalog is
 * distributed across the seven chakras and their Solfeggio frequencies.
 *
 * Rendered as a horizontal 7-tile strip. Each tile shows:
 *   - The chakra name (ROOT, SACRAL, …)
 *   - The Solfeggio frequency in Hz (396, 417, …)
 *   - The current count of songs in that chakra
 *   - An "ok" highlight when count >= 1 (the simplest version of the
 *     "1+ per chakra" target the spec calls out).
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  SUNO_CHAKRAS,
  SUNO_CHAKRA_FREQUENCIES,
  type SunoChakra,
  type SunoIssue,
} from "@/api/sunoPipeline";

interface ChakraFrequencyMapProps {
  issues: SunoIssue[];
  /** Fired when a chakra cell is clicked — opens the invocation dialog. */
  onChakraClick?: (chakra: SunoChakra) => void;
  /** Optional className passthrough for layout containment. */
  className?: string;
}

// Tailwind classes (not inline colors) so dark/light theme tokens still apply.
const CHAKRA_TONE: Record<SunoChakra, string> = {
  ROOT: "bg-red-500/15 text-red-300 border-red-500/30",
  SACRAL: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  SOLAR: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  HEART: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  THROAT: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  THIRD_EYE: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  CROWN: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

const CHAKRA_LABEL: Record<SunoChakra, string> = {
  ROOT: "Root",
  SACRAL: "Sacral",
  SOLAR: "Solar",
  HEART: "Heart",
  THROAT: "Throat",
  THIRD_EYE: "Third Eye",
  CROWN: "Crown",
};

export function ChakraFrequencyMap({ issues, onChakraClick, className }: ChakraFrequencyMapProps) {
  const counts = useMemo(() => {
    const out = Object.fromEntries(
      SUNO_CHAKRAS.map((c) => [c, 0]),
    ) as Record<SunoChakra, number>;
    for (const issue of issues) {
      if (issue.targetChakra in out) out[issue.targetChakra] += 1;
    }
    return out;
  }, [issues]);

  const total = issues.length;
  const covered = SUNO_CHAKRAS.filter((c) => counts[c] > 0).length;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Chakra Frequency Map</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {covered}/7 chakras covered · {total} songs total
        </span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {SUNO_CHAKRAS.map((chakra) => {
          const count = counts[chakra];
          const isCovered = count > 0;
          return (
            <button
              type="button"
              key={chakra}
              onClick={() => onChakraClick?.(chakra)}
              className={cn(
                "rounded-md border p-3 text-left transition-all",
                CHAKRA_TONE[chakra],
                isCovered ? "opacity-100" : "opacity-50",
                onChakraClick &&
                  "cursor-pointer hover:ring-1 hover:ring-current hover:scale-[1.02]",
              )}
              data-chakra={chakra}
              data-count={count}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-70">
                {CHAKRA_LABEL[chakra]}
              </div>
              <div className="text-base font-semibold tabular-nums">
                {SUNO_CHAKRA_FREQUENCIES[chakra]} Hz
              </div>
              <div className="text-xs tabular-nums opacity-80">
                {count} {count === 1 ? "song" : "songs"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
