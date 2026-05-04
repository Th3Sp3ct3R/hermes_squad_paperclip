/**
 * SacredGeometry — SVG glyphs for the Suno pipeline.
 *
 * Two families:
 *  1. ChakraYantra — one yantra per chakra, replaces emoji on cards.
 *     ROOT=square, SACRAL=vesica, SOLAR=triangle, HEART=hexagram,
 *     THROAT=pentagon, THIRD_EYE=Sri Yantra (simplified), CROWN=Metatron's Cube.
 *
 *  2. SphereGeometry — one form per archangel's Tree-of-Life sphere, used as
 *     a halo/ring around the portrait (ArchangelAvatar). Pulsing when working.
 *
 * All SVGs:
 *   - viewBox="0 0 100 100"
 *   - stroke = currentColor (color via parent class)
 *   - fill = none unless noted
 *   - subset coverage: see SUBSET_COVERAGE comment below
 */
import { cn } from "@/lib/utils";

// ── Chakra yantras ────────────────────────────────────────────────────────
// Subset note: all 7 are implemented; Crown + Third-Eye are simplified
// versions of Metatron's Cube and Sri Yantra so they read at small sizes.

const ChakraSquare = () => (
  <rect x="20" y="20" width="60" height="60" />
);

const ChakraVesicaPiscis = () => (
  <g>
    <circle cx="38" cy="50" r="28" />
    <circle cx="62" cy="50" r="28" />
  </g>
);

const ChakraTriangleUp = () => (
  <polygon points="50,12 88,82 12,82" />
);

const ChakraHexagram = () => (
  <g>
    <polygon points="50,12 88,76 12,76" />
    <polygon points="50,88 12,24 88,24" />
  </g>
);

const ChakraPentagon = () => (
  // Regular pentagon — vertex up
  <polygon points="50,8 92.8,38.7 76.5,88 23.5,88 7.2,38.7" />
);

const ChakraSriYantraLite = () => (
  // Simplified Sri Yantra — 4 up + 4 down interlocking triangles
  <g>
    <polygon points="50,12 88,80 12,80" />
    <polygon points="50,88 12,20 88,20" />
    <polygon points="50,28 76,72 24,72" />
    <polygon points="50,72 24,28 76,28" />
    <circle cx="50" cy="50" r="3" fill="currentColor" />
  </g>
);

const ChakraMetatronCubeLite = () => (
  // Simplified — 7 circles (1 center + 6 surrounding) + connecting lines
  <g>
    <circle cx="50" cy="50" r="10" />
    <circle cx="50" cy="22" r="10" />
    <circle cx="50" cy="78" r="10" />
    <circle cx="74" cy="36" r="10" />
    <circle cx="74" cy="64" r="10" />
    <circle cx="26" cy="36" r="10" />
    <circle cx="26" cy="64" r="10" />
    {/* Connecting lines */}
    <line x1="50" y1="22" x2="50" y2="78" />
    <line x1="26" y1="36" x2="74" y2="64" />
    <line x1="74" y1="36" x2="26" y2="64" />
    <line x1="50" y1="22" x2="74" y2="36" />
    <line x1="74" y1="36" x2="74" y2="64" />
    <line x1="74" y1="64" x2="50" y2="78" />
    <line x1="50" y1="78" x2="26" y2="64" />
    <line x1="26" y1="64" x2="26" y2="36" />
    <line x1="26" y1="36" x2="50" y2="22" />
  </g>
);

const CHAKRA_GLYPH_MAP = {
  ROOT: ChakraSquare,
  SACRAL: ChakraVesicaPiscis,
  SOLAR: ChakraTriangleUp,
  HEART: ChakraHexagram,
  THROAT: ChakraPentagon,
  THIRD_EYE: ChakraSriYantraLite,
  CROWN: ChakraMetatronCubeLite,
} as const;

export type ChakraKey = keyof typeof CHAKRA_GLYPH_MAP;

const CHAKRA_COLOR_CLASS: Record<ChakraKey, string> = {
  ROOT: "text-red-500",
  SACRAL: "text-orange-500",
  SOLAR: "text-yellow-500",
  HEART: "text-emerald-500",
  THROAT: "text-sky-500",
  THIRD_EYE: "text-indigo-500",
  CROWN: "text-violet-400",
};

interface ChakraYantraProps {
  chakra: ChakraKey;
  size?: number;
  className?: string;
  /** Override the default chakra color. */
  colorClass?: string;
  strokeWidth?: number;
  /** When true, slowly rotate the yantra (used during GENERATING). */
  spinning?: boolean;
}

export function ChakraYantra({
  chakra,
  size = 16,
  className,
  colorClass,
  strokeWidth = 2,
  spinning = false,
}: ChakraYantraProps) {
  const Glyph = CHAKRA_GLYPH_MAP[chakra];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        colorClass ?? CHAKRA_COLOR_CLASS[chakra],
        spinning && "chakra-spin",
        className,
      )}
      aria-hidden="true"
    >
      <Glyph />
    </svg>
  );
}

// ── Sphere geometry (archangel halos) ─────────────────────────────────────
// Subset note: all 10 implemented but Sri Yantra and Metatron's Cube reuse
// the simplified chakra renders. Full ornate versions are a follow-up.

const SpherePentagram = () => (
  // 5-point star — vertex up. Skip-2 connection {5/2}.
  <path d="M 50 5 L 76.5 86.4 L 7.2 36.1 L 92.8 36.1 L 23.5 86.4 Z" />
);

const SphereHexagram = () => (
  <g>
    <polygon points="50,5 92.8,79 7.2,79" />
    <polygon points="50,95 7.2,21 92.8,21" />
  </g>
);

const SphereNonagon = () => (
  <polygon points="50,5 78.9,15.5 94.3,42.2 89.0,72.5 65.4,92.3 34.6,92.3 11.0,72.5 5.7,42.2 21.1,15.5" />
);

const SphereHeptagram = () => (
  // 7-point star, skip-2 {7/2}
  <path d="M 50 5 L 69.6 90.6 L 14.8 21.9 L 93.9 60.0 L 30.4 90.6 L 85.2 21.9 L 6.1 60.0 Z" />
);

const SphereVesicaPiscis = () => (
  <g>
    <circle cx="35" cy="50" r="40" />
    <circle cx="65" cy="50" r="40" />
  </g>
);

const SphereHexagramInSquare = () => (
  <g>
    <rect x="5" y="5" width="90" height="90" />
    <polygon points="50,12 90,79 10,79" />
    <polygon points="50,87 10,20 90,20" />
  </g>
);

const SphereSriYantra = () => (
  // Reuse chakra version — simplified
  <g>
    <polygon points="50,8 92,84 8,84" />
    <polygon points="50,92 8,16 92,16" />
    <polygon points="50,24 78,76 22,76" />
    <polygon points="50,76 22,24 78,24" />
    <circle cx="50" cy="50" r="3" fill="currentColor" />
  </g>
);

const SphereCube = () => (
  // Isometric cube outline
  <g>
    <polygon points="50,10 88,30 88,72 50,92 12,72 12,30" />
    <line x1="50" y1="10" x2="50" y2="50" />
    <line x1="50" y1="50" x2="88" y2="30" />
    <line x1="50" y1="50" x2="12" y2="30" />
    <line x1="50" y1="50" x2="50" y2="92" />
  </g>
);

const SphereMetatronCube = () => (
  // 13-circle Metatron's Cube + connecting lines
  <g>
    <circle cx="50" cy="50" r="6" />
    <circle cx="50" cy="20" r="6" />
    <circle cx="50" cy="80" r="6" />
    <circle cx="76" cy="35" r="6" />
    <circle cx="76" cy="65" r="6" />
    <circle cx="24" cy="35" r="6" />
    <circle cx="24" cy="65" r="6" />
    <circle cx="50" cy="6" r="4" />
    <circle cx="50" cy="94" r="4" />
    <circle cx="92" cy="28" r="4" />
    <circle cx="8" cy="28" r="4" />
    <circle cx="92" cy="72" r="4" />
    <circle cx="8" cy="72" r="4" />
    {/* Inner hex connections */}
    <line x1="50" y1="20" x2="50" y2="80" />
    <line x1="24" y1="35" x2="76" y2="65" />
    <line x1="76" y1="35" x2="24" y2="65" />
    <line x1="50" y1="20" x2="76" y2="35" />
    <line x1="76" y1="35" x2="76" y2="65" />
    <line x1="76" y1="65" x2="50" y2="80" />
    <line x1="50" y1="80" x2="24" y2="65" />
    <line x1="24" y1="65" x2="24" y2="35" />
    <line x1="24" y1="35" x2="50" y2="20" />
  </g>
);

const SphereSaturnSeal = () => (
  // Heptagon + Saturn ring
  <g>
    <polygon points="50,8 89.5,30 89.5,70 50,92 10.5,70 10.5,30" />
    <ellipse cx="50" cy="50" rx="48" ry="14" transform="rotate(-12 50 50)" />
  </g>
);

const SPHERE_GEOMETRY_MAP = {
  Michael: SpherePentagram,
  Raphael: SphereHexagram,
  Gabriel: SphereNonagon,
  Metatron: SphereMetatronCube,
  Uriel: SphereHeptagram,
  Jophiel: SphereVesicaPiscis,
  Zadkiel: SphereHexagramInSquare,
  Raziel: SphereSriYantra,
  Sandalphon: SphereCube,
  Cassiel: SphereSaturnSeal,
} as const;

export type ArchangelName = keyof typeof SPHERE_GEOMETRY_MAP;

/** Tree-of-Life sphere → CSS text color used for the geometry stroke + glow. */
export const SPHERE_COLOR_CLASS: Record<ArchangelName, string> = {
  Michael: "text-red-500",
  Raphael: "text-amber-400",
  Gabriel: "text-violet-400",
  Metatron: "text-slate-100",
  Uriel: "text-emerald-400",
  Jophiel: "text-slate-300",
  Zadkiel: "text-blue-500",
  Raziel: "text-purple-400",
  Sandalphon: "text-amber-700",
  Cassiel: "text-slate-500",
};

interface SphereGeometryProps {
  archangel: ArchangelName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function SphereGeometry({
  archangel,
  size = 56,
  className,
  strokeWidth = 1.5,
}: SphereGeometryProps) {
  const Geometry = SPHERE_GEOMETRY_MAP[archangel];
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(SPHERE_COLOR_CLASS[archangel], className)}
      aria-hidden="true"
    >
      <Geometry />
    </svg>
  );
}

export const SACRED_GEOMETRY_SUBSET = {
  chakraYantras: Object.keys(CHAKRA_GLYPH_MAP),
  archangelFrames: Object.keys(SPHERE_GEOMETRY_MAP),
} as const;
