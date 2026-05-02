/**
 * ArchangelAvatar — circular portrait of an archangel framed by their
 * Tree-of-Life sphere geometry.
 *
 * The portrait PNG comes from `ui/public/archangels/<name>.png` (rendered by
 * scripts/render-archangels.ts via Gemini Flash Image).
 *
 * The sphere geometry (pentagram, hexagram, vesica, Metatron's Cube, etc.)
 * sits behind the portrait as a luminous halo. When `working` is true the
 * frame slowly pulses to indicate active work by that archangel.
 *
 * Sizes:
 *   xs — 20px (kanban inline)
 *   sm — 28px (kanban primary)
 *   md — 40px (detail panes)
 *   lg — 64px (agent list)
 */
import { cn } from "@/lib/utils";
import {
  SphereGeometry,
  SPHERE_COLOR_CLASS,
  type ArchangelName,
} from "./SacredGeometry";

const SIZE_PX: Record<"xs" | "sm" | "md" | "lg", number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 64,
};

const FRAME_SCALE = 1.6; // halo larger than portrait

const ARCHANGEL_TITLE: Record<ArchangelName, string> = {
  Michael: "Michael — Pipeline Commander (Geburah)",
  Raphael: "Raphael — Quality Gate (Tiphareth)",
  Gabriel: "Gabriel — Release Comms (Yesod)",
  Metatron: "Metatron — Celestial Scribe (Keter)",
  Uriel: "Uriel — Sound Prompt Engineer (Netzach)",
  Jophiel: "Jophiel — Visual Art (Chokmah)",
  Zadkiel: "Zadkiel — Lyricist (Chesed)",
  Raziel: "Raziel — Audio Engineer (Chokmah)",
  Sandalphon: "Sandalphon — Delivery (Malkuth)",
  Cassiel: "Cassiel — Video Montage (Binah)",
};

interface ArchangelAvatarProps {
  name: ArchangelName | string;
  size?: keyof typeof SIZE_PX;
  /** Pulse ring while archangel is doing active work. */
  working?: boolean;
  /** Render only the geometry (no portrait) — useful for fallbacks. */
  geometryOnly?: boolean;
  className?: string;
}

export function ArchangelAvatar({
  name,
  size = "sm",
  working = false,
  geometryOnly = false,
  className,
}: ArchangelAvatarProps) {
  // Coerce to a known archangel; if not, fall back to a neutral circle.
  const known = (name in SPHERE_COLOR_CLASS ? name : null) as ArchangelName | null;
  const portraitPx = SIZE_PX[size];
  const framePx = Math.round(portraitPx * FRAME_SCALE);

  const title = known ? ARCHANGEL_TITLE[known] : name;
  const portraitSrc = known
    ? `/archangels/${known.toLowerCase()}.png`
    : null;

  return (
    <div
      title={title}
      className={cn(
        "relative inline-flex items-center justify-center select-none",
        className,
      )}
      style={{ width: framePx, height: framePx }}
    >
      {/* Sphere geometry halo */}
      {known && (
        <SphereGeometry
          archangel={known}
          size={framePx}
          className={cn(
            "absolute inset-0",
            working && "archangel-pulse",
          )}
        />
      )}

      {/* Portrait — circular crop centered inside the geometry */}
      {!geometryOnly && portraitSrc && (
        <img
          src={portraitSrc}
          alt=""
          loading="lazy"
          decoding="async"
          width={portraitPx}
          height={portraitPx}
          className={cn(
            "relative rounded-full object-cover ring-1 ring-black/30 shadow-md",
          )}
          style={{ width: portraitPx, height: portraitPx }}
        />
      )}

      {/* Fallback: initial letter when archangel name is unknown */}
      {!known && (
        <span
          className="relative inline-flex items-center justify-center rounded-full border bg-muted text-[10px] font-medium uppercase text-muted-foreground"
          style={{ width: portraitPx, height: portraitPx }}
        >
          {String(name)[0] ?? "?"}
        </span>
      )}
    </div>
  );
}

interface ArchangelAvatarStackProps {
  names: (ArchangelName | string)[];
  size?: keyof typeof SIZE_PX;
  workingNames?: (ArchangelName | string)[];
  max?: number;
  className?: string;
}

/** Horizontally stacked, slightly overlapping. Truncates with "+N" badge. */
export function ArchangelAvatarStack({
  names,
  size = "xs",
  workingNames = [],
  max = 4,
  className,
}: ArchangelAvatarStackProps) {
  const visible = names.slice(0, max);
  const remainder = names.length - visible.length;
  const workingSet = new Set(workingNames);
  const overlap = SIZE_PX[size] * 0.4;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((n, i) => (
        <div
          key={`${n}-${i}`}
          style={{ marginLeft: i === 0 ? 0 : -overlap }}
          className="relative"
        >
          <ArchangelAvatar
            name={n}
            size={size}
            working={workingSet.has(n)}
          />
        </div>
      ))}
      {remainder > 0 && (
        <span
          className="ml-1 inline-flex items-center justify-center rounded-full border bg-muted px-1.5 text-[9px] font-medium text-muted-foreground"
          style={{ height: SIZE_PX[size] }}
        >
          +{remainder}
        </span>
      )}
    </div>
  );
}
