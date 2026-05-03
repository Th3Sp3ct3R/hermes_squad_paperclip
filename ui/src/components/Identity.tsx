import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArchangelAvatar } from "./ArchangelAvatar";
import { SPHERE_COLOR_CLASS, type ArchangelName } from "./SacredGeometry";

type IdentitySize = "xs" | "sm" | "default" | "lg";

export interface IdentityProps {
  name: string;
  avatarUrl?: string | null;
  initials?: string;
  size?: IdentitySize;
  className?: string;
  /** When true, mark the archangel as "working" (pulse the sphere ring). */
  working?: boolean;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const textSize: Record<IdentitySize, string> = {
  xs: "text-sm",
  sm: "text-xs",
  default: "text-sm",
  lg: "text-sm",
};

const ARCHANGEL_NAMES = new Set(Object.keys(SPHERE_COLOR_CLASS));
const isArchangel = (name: string): name is ArchangelName => ARCHANGEL_NAMES.has(name);

/**
 * Map Identity's size scale onto ArchangelAvatar's:
 *   xs/sm → "xs" (20px portrait, ~32px frame — matches Avatar size="xs"/"sm")
 *   default → "sm" (28px portrait, ~45px frame — matches Avatar default)
 *   lg → "md" (40px portrait, ~64px frame — matches Avatar size="lg")
 */
const archangelSize: Record<IdentitySize, "xs" | "sm" | "md"> = {
  xs: "xs",
  sm: "xs",
  default: "sm",
  lg: "md",
};

export function Identity({ name, avatarUrl, initials, size = "default", className, working = false }: IdentityProps) {
  // When the name matches one of the 10 archangels, render the sphere-framed
  // portrait instead of the generic Avatar. avatarUrl is ignored here — the
  // canonical archangel portraits live at /archangels/<name>.png.
  if (isArchangel(name)) {
    return (
      <span
        className={cn(
          "inline-flex gap-1.5",
          size === "xs" ? "items-baseline gap-1" : "items-center",
          size === "lg" && "gap-2",
          className,
        )}
      >
        <ArchangelAvatar
          name={name}
          size={archangelSize[size]}
          working={working}
          className={size === "xs" ? "relative -top-px" : undefined}
        />
        <span className={cn("truncate", textSize[size])}>{name}</span>
      </span>
    );
  }

  const displayInitials = initials ?? deriveInitials(name);

  return (
    <span className={cn("inline-flex gap-1.5", size === "xs" ? "items-baseline gap-1" : "items-center", size === "lg" && "gap-2", className)}>
      <Avatar size={size} className={size === "xs" ? "relative -top-px" : undefined}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback>{displayInitials}</AvatarFallback>
      </Avatar>
      <span className={cn("truncate", textSize[size])}>{name}</span>
    </span>
  );
}
