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
      {/* Tree of Life — glowing background watermark */}
      <svg
        viewBox="0 0 200 320"
        fill="none"
        className="absolute inset-x-0 bottom-0 w-full pointer-events-none opacity-[0.04]"
        style={{ filter: "drop-shadow(0 0 8px rgba(255,255,255,0.3))" }}
        aria-hidden="true"
      >
        {/* 10 Sephiroth (spheres) */}
        <circle cx="100" cy="20"  r="12" stroke="#fff" strokeWidth="1.5" /> {/* Keter */}
        <circle cx="65"  cy="60"  r="10" stroke="#fff" strokeWidth="1.5" /> {/* Chokmah */}
        <circle cx="135" cy="60"  r="10" stroke="#fff" strokeWidth="1.5" /> {/* Binah */}
        <circle cx="65"  cy="120" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Chesed */}
        <circle cx="135" cy="120" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Geburah */}
        <circle cx="100" cy="150" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Tiphareth */}
        <circle cx="65"  cy="200" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Netzach */}
        <circle cx="135" cy="200" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Hod */}
        <circle cx="100" cy="240" r="10" stroke="#fff" strokeWidth="1.5" /> {/* Yesod */}
        <circle cx="100" cy="300" r="12" stroke="#fff" strokeWidth="1.5" /> {/* Malkuth */}
        {/* 22 Paths (connecting lines) */}
        <line x1="100" y1="32" x2="65"  y2="50"  stroke="#fff" strokeWidth="1" /> {/* Keter-Chokmah */}
        <line x1="100" y1="32" x2="135" y2="50"  stroke="#fff" strokeWidth="1" /> {/* Keter-Binah */}
        <line x1="65"  y1="60" x2="135" y2="60"  stroke="#fff" strokeWidth="1" /> {/* Chokmah-Binah */}
        <line x1="65"  y1="70" x2="65"  y2="110" stroke="#fff" strokeWidth="1" /> {/* Chokmah-Chesed */}
        <line x1="135" y1="70" x2="135" y2="110" stroke="#fff" strokeWidth="1" /> {/* Binah-Geburah */}
        <line x1="65"  y1="70" x2="100" y2="140" stroke="#fff" strokeWidth="1" /> {/* Chokmah-Tiphareth */}
        <line x1="135" y1="70" x2="100" y2="140" stroke="#fff" strokeWidth="1" /> {/* Binah-Tiphareth */}
        <line x1="65"  y1="120" x2="135" y2="120" stroke="#fff" strokeWidth="1" /> {/* Chesed-Geburah */}
        <line x1="65"  y1="130" x2="100" y2="140" stroke="#fff" strokeWidth="1" /> {/* Chesed-Tiphareth */}
        <line x1="135" y1="130" x2="100" y2="140" stroke="#fff" strokeWidth="1" /> {/* Geburah-Tiphareth */}
        <line x1="65"  y1="130" x2="65"  y2="190" stroke="#fff" strokeWidth="1" /> {/* Chesed-Netzach */}
        <line x1="135" y1="130" x2="135" y2="190" stroke="#fff" strokeWidth="1" /> {/* Geburah-Hod */}
        <line x1="100" y1="160" x2="65"  y2="190" stroke="#fff" strokeWidth="1" /> {/* Tiphareth-Netzach */}
        <line x1="100" y1="160" x2="135" y2="190" stroke="#fff" strokeWidth="1" /> {/* Tiphareth-Hod */}
        <line x1="100" y1="160" x2="100" y2="230" stroke="#fff" strokeWidth="1" /> {/* Tiphareth-Yesod */}
        <line x1="65"  y1="200" x2="135" y2="200" stroke="#fff" strokeWidth="1" /> {/* Netzach-Hod */}
        <line x1="65"  y1="210" x2="100" y2="230" stroke="#fff" strokeWidth="1" /> {/* Netzach-Yesod */}
        <line x1="135" y1="210" x2="100" y2="230" stroke="#fff" strokeWidth="1" /> {/* Hod-Yesod */}
        <line x1="100" y1="250" x2="100" y2="288" stroke="#fff" strokeWidth="1" /> {/* Yesod-Malkuth */}
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
            <span className="truncate">New Issue</span>
          </button>
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={GLYPH.SUN} liveCount={liveRunCount} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
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
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Company">
          <SidebarNavItem to="/org" label="Org" icon={GLYPH.SATURN} />
          <SidebarNavItem to="/costs" label="Costs" icon={GLYPH.SALT} />
          <SidebarNavItem to="/activity" label="Activity" icon={GLYPH.MARS} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={GLYPH.VENUS} />
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
