/**
 * CaduceusMark — small inline-SVG of Hermes' staff (two serpents twined
 * around a winged rod). Used as the section glyph throughout The Observatory.
 *
 * Inherits color via `currentColor` so the existing `.seclabel.b/.r/.p/.w`
 * modifier classes (or any parent text-color class) drive its tint:
 *
 *   <h3 className="seclabel b"><CaduceusMark /> The Ephemeris</h3>
 *
 * Drop-in replacement for the legacy `<span className="lc" />` lightsaber
 * chevron. Identical sizing / spacing semantics inside the seclabel flexbox.
 */
import { cn } from "@/lib/utils";

interface CaduceusMarkProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function CaduceusMark({
  size = 12,
  className,
  strokeWidth = 1.4,
}: CaduceusMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("inline-block flex-shrink-0", className)}
      aria-hidden="true"
    >
      {/* central staff */}
      <line x1="12" y1="3" x2="12" y2="22" />
      {/* orb at top */}
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none" />
      {/* wings — two short flares angling out from the staff just below the orb */}
      <path d="M 12 5 Q 7 5.5 5 8" />
      <path d="M 12 5 Q 17 5.5 19 8" />
      {/* feather strokes on each wing */}
      <path d="M 8.5 6 L 7.5 7.5" />
      <path d="M 15.5 6 L 16.5 7.5" />
      {/* two serpents — left and right S-curves crossing through the staff */}
      <path d="M 8 9 Q 14 11 8 14 Q 14 16 8 19" />
      <path d="M 16 9 Q 10 11 16 14 Q 10 16 16 19" />
      {/* serpent heads — small dots at the bottom ends */}
      <circle cx="8" cy="19.4" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="19.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
