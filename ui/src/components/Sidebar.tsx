import {
  Search,
} from "lucide-react";

// ── Alchemical & Planetary Glyphs ──────────────────────────────────
// Planetary: ☉ Sun, ☽ Moon, ☿ Mercury, ♀ Venus, ♂ Mars, ♃ Jupiter, ♄ Saturn
// Elemental: 🜂 Fire, 🜁 Air, 🜄 Water, 🜃 Earth
// Tria Prima: 🜍 Sulphur (soul), ☿ Mercury (spirit), 🜔 Salt (body)
const GLYPH = {
  SUN:      "☉",   // Raphael / Tiphareth    → Dashboard
  MOON:     "☽",   // Gabriel / Yesod        → Inbox
  MERCURY:  "☿",   // Hermes / Hod           → Issues
  VENUS:    "♀",   // Haniel / Netzach       → Settings
  MARS:     "♂",   // Khamael / Geburah      → Activity
  JUPITER:  "♃",   // Zadkiel / Chesed       → Goals
  SATURN:   "♄",   // Cassiel / Tzaphkiel    → Org
  FIRE:     "🜂",   // Michael / South        → New Issue
  SULPHUR:  "🜍",   // Soul / anima           → Suno Pipeline
  SALT:     "🜔",   // Body / corpus          → Costs
} as const;
import { useQuery } from "@tanstack/react-query";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-60 h-full min-h-0 border-r border-border bg-background flex flex-col relative overflow-hidden">
      {/* Tree of Life — animated ambient light watermark */}
      {/* treeGlow breathes the whole SVG 4%→8%→4% over 8s.             */}
      {/* Each path carries a traveling-light dash (pathFlow) with a     */}
      {/* sequential delay so energy descends Keter → Malkuth.           */}
      {/* Sephiroth circles pulse (sephPulse) when the light arrives.    */}
      <svg
        viewBox="0 0 200 320"
        fill="none"
        className="tree-of-life-glow absolute inset-x-0 bottom-0 w-full pointer-events-none"
        style={{ filter: "drop-shadow(0 0 8px rgba(255,255,255,0.3))" }}
        aria-hidden="true"
      >
        {/* 10 Sephiroth — pulse delays keyed to when the traveling light arrives */}
        {/* Keter — tier 0, light originates here */}
        <circle cx="100" cy="20"  r="12" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "0s" }} />
        {/* Chokmah / Binah — tier 1 (delay ~0.5s) */}
        <circle cx="65"  cy="60"  r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "0.5s" }} />
        <circle cx="135" cy="60"  r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "0.5s" }} />
        {/* Chesed / Geburah — tier 2 (delay ~1.2s) */}
        <circle cx="65"  cy="120" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "1.2s" }} />
        <circle cx="135" cy="120" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "1.2s" }} />
        {/* Tiphareth — tier 3 (delay ~2.0s) */}
        <circle cx="100" cy="150" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "2.0s" }} />
        {/* Netzach / Hod — tier 4 (delay ~3.0s) */}
        <circle cx="65"  cy="200" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "3.0s" }} />
        <circle cx="135" cy="200" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "3.0s" }} />
        {/* Yesod — tier 5 (delay ~4.0s) */}
        <circle cx="100" cy="240" r="10" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "4.0s" }} />
        {/* Malkuth — tier 6 (delay ~5.0s) */}
        <circle cx="100" cy="300" r="12" stroke="#fff" strokeWidth="1.5"
          className="tree-seph-pulse"
          style={{ animationDelay: "5.0s" }} />

        {/* 19 Paths — traveling light dashes, staggered top→bottom            */}
        {/* stroke-dasharray = "highlight-len path-len" where highlight ≈ 30%   */}
        {/* --path-len CSS var drives the keyframe start offset                 */}

        {/* Tier 0→1: from Keter downward (delays 0–0.4s) */}
        {/* Keter-Chokmah  len≈39 */}
        <line x1="100" y1="32" x2="65"  y2="50"  stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 39", ["--path-len" as string]: "39", animationDelay: "0s" }} />
        {/* Keter-Binah  len≈39 */}
        <line x1="100" y1="32" x2="135" y2="50"  stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 39", ["--path-len" as string]: "39", animationDelay: "0.15s" }} />

        {/* Tier 1 horizontal: Chokmah-Binah  len=70 */}
        <line x1="65"  y1="60" x2="135" y2="60"  stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "21 70", ["--path-len" as string]: "70", animationDelay: "0.5s" }} />

        {/* Tier 1→2: vertical pillars and cross-paths (delays 0.6–1.1s) */}
        {/* Chokmah-Chesed  len=40 */}
        <line x1="65"  y1="70" x2="65"  y2="110" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 40", ["--path-len" as string]: "40", animationDelay: "0.6s" }} />
        {/* Binah-Geburah  len=40 */}
        <line x1="135" y1="70" x2="135" y2="110" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 40", ["--path-len" as string]: "40", animationDelay: "0.6s" }} />
        {/* Chokmah-Tiphareth  len≈78 */}
        <line x1="65"  y1="70" x2="100" y2="140" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "23 78", ["--path-len" as string]: "78", animationDelay: "0.9s" }} />
        {/* Binah-Tiphareth  len≈78 */}
        <line x1="135" y1="70" x2="100" y2="140" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "23 78", ["--path-len" as string]: "78", animationDelay: "0.9s" }} />

        {/* Tier 2 horizontal: Chesed-Geburah  len=70 */}
        <line x1="65"  y1="120" x2="135" y2="120" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "21 70", ["--path-len" as string]: "70", animationDelay: "1.2s" }} />

        {/* Tier 2→3: into Tiphareth (delays 1.4–1.9s) */}
        {/* Chesed-Tiphareth  len≈36 */}
        <line x1="65"  y1="130" x2="100" y2="140" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "11 36", ["--path-len" as string]: "36", animationDelay: "1.5s" }} />
        {/* Geburah-Tiphareth  len≈36 */}
        <line x1="135" y1="130" x2="100" y2="140" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "11 36", ["--path-len" as string]: "36", animationDelay: "1.5s" }} />

        {/* Tier 2→4: pillar side-channels (delays 1.8–2.2s) */}
        {/* Chesed-Netzach  len=60 */}
        <line x1="65"  y1="130" x2="65"  y2="190" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "18 60", ["--path-len" as string]: "60", animationDelay: "1.8s" }} />
        {/* Geburah-Hod  len=60 */}
        <line x1="135" y1="130" x2="135" y2="190" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "18 60", ["--path-len" as string]: "60", animationDelay: "1.8s" }} />

        {/* Tier 3→4: from Tiphareth outward (delays 2.2–2.8s) */}
        {/* Tiphareth-Netzach  len≈46 */}
        <line x1="100" y1="160" x2="65"  y2="190" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "14 46", ["--path-len" as string]: "46", animationDelay: "2.2s" }} />
        {/* Tiphareth-Hod  len≈46 */}
        <line x1="100" y1="160" x2="135" y2="190" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "14 46", ["--path-len" as string]: "46", animationDelay: "2.2s" }} />
        {/* Tiphareth-Yesod  len=70 */}
        <line x1="100" y1="160" x2="100" y2="230" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "21 70", ["--path-len" as string]: "70", animationDelay: "2.5s" }} />

        {/* Tier 4 horizontal: Netzach-Hod  len=70 */}
        <line x1="65"  y1="200" x2="135" y2="200" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "21 70", ["--path-len" as string]: "70", animationDelay: "3.0s" }} />

        {/* Tier 4→5: into Yesod (delays 3.3–3.6s) */}
        {/* Netzach-Yesod  len≈40 */}
        <line x1="65"  y1="210" x2="100" y2="230" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 40", ["--path-len" as string]: "40", animationDelay: "3.4s" }} />
        {/* Hod-Yesod  len≈40 */}
        <line x1="135" y1="210" x2="100" y2="230" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "12 40", ["--path-len" as string]: "40", animationDelay: "3.4s" }} />

        {/* Tier 5→6: Yesod-Malkuth  len=38 — the final descent */}
        <line x1="100" y1="250" x2="100" y2="288" stroke="#fff" strokeWidth="1"
          className="tree-path-flow"
          style={{ strokeDasharray: "11 38", ["--path-len" as string]: "38", animationDelay: "4.5s" }} />
      </svg>

      {/* Top bar: Company name (bold) + Search — aligned with top sections (no visible border) */}
      <div className="flex items-center gap-1 px-3 h-12 shrink-0">
        {selectedCompany?.brandColor && (
          <div
            className="w-4 h-4 rounded-sm shrink-0 ml-1"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 text-sm font-bold text-foreground truncate pl-1">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {/* New Issue button aligned with nav items */}
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <span className="flex h-4 w-4 items-center justify-center text-[15px] leading-none opacity-80 shrink-0">{GLYPH.FIRE}</span>
            <span className="truncate">Summon</span>
          </button>
          <SidebarNavItem to="/dashboard" label="The Observatory" icon={GLYPH.SUN} liveCount={liveRunCount} />
          <SidebarNavItem
            to="/inbox"
            label="The Codex"
            icon={GLYPH.MOON}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="The Workings" icon={GLYPH.MERCURY} />
          <SidebarNavItem to="/goals" label="The Intentions" icon={GLYPH.JUPITER} />
          <SidebarNavItem to="/suno" label="The Hermetica" icon={GLYPH.SULPHUR} />
          <SidebarNavItem to="/hermes/chat" label="Hermes" icon="☿" />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Company">
          <SidebarNavItem to="/org" label="Org ♄" icon={GLYPH.SATURN} />
          <SidebarNavItem to="/costs" label="Ledger ♃" icon={GLYPH.SALT} />
          <SidebarNavItem to="/activity" label="Activity ♂" icon={GLYPH.MARS} />
          <SidebarNavItem to="/company/settings" label="Tuning ☿" icon={GLYPH.VENUS} />
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>
    </aside>
  );
}
