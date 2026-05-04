import { NavLink } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useCompany } from "@/context/CompanyContext";
import { useDialog } from "@/context/DialogContext";

// Hermes Squad register — Issues/Goals/Projects/Suno renamed to the
// alchemical-opus vocabulary the cosmology calls for.
//   The Workings    — active operations
//   The Intentions  — stated ends
//   The Operations  — multi-step works
//   Musica Universalis — the music of the spheres
const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/agents", label: "Agents" },
  { to: "/issues", label: "The Workings" },
  { to: "/goals", label: "The Intentions" },
  { to: "/projects", label: "The Operations" },
  { to: "/suno", label: "Musica Universalis" },
  { to: "/activity", label: "Activity" },
  { to: "/costs", label: "Costs" },
] as const;

export function TopBar() {
  const { selectedCompany } = useCompany();
  const { openNewIssue } = useDialog();

  return (
    <div className="flex items-center gap-3.5 h-12 px-4 border-b border-[rgba(255,255,255,0.14)] bg-[#09090B] shrink-0 relative z-10">
      {/* Logo — Caduceus of Hermes (glowing) */}
      <div
        className="w-9 h-9 rounded-lg grid place-items-center border border-[rgba(255,255,255,0.14)] shrink-0"
        style={{ background: "#0a0a0a", boxShadow: "0 0 12px rgba(255,255,255,0.08)" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" fill="none" className="w-5 h-5" style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.5))" }}>
          {/* Staff */}
          <line x1="32" y1="14" x2="32" y2="58" stroke="#ededed" strokeWidth="2" strokeLinecap="round" />
          {/* Head circle */}
          <circle cx="32" cy="11" r="3.5" stroke="#ededed" strokeWidth="1.6" />
          {/* Left wing */}
          <path d="M28.5 14 C24 10, 16 8, 8 12 C12 8, 18 6, 24 8 C20 5, 14 3, 8 5" stroke="#ededed" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Right wing */}
          <path d="M35.5 14 C40 10, 48 8, 56 12 C52 8, 46 6, 40 8 C44 5, 50 3, 56 5" stroke="#ededed" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Left serpent */}
          <path d="M32 18 C26 22, 22 24, 24 28 C26 32, 32 30, 32 34 C32 38, 26 36, 24 40 C22 44, 26 46, 32 50" stroke="#ededed" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {/* Right serpent */}
          <path d="M32 18 C38 22, 42 24, 40 28 C38 32, 32 30, 32 34 C32 38, 38 36, 40 40 C42 44, 38 46, 32 50" stroke="#ededed" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Title */}
      <div className="text-[15px] font-semibold tracking-[-0.01em] shrink-0">
        {selectedCompany?.name ?? "Hermes"} <span className="text-[#a1a1a1] font-normal">/ Workspace</span>
      </div>

      {/* Nav links */}
      <nav className="flex gap-1 ml-4.5">
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "px-3 py-1.5 rounded-full text-[13px] transition-colors",
                isActive
                  ? "bg-[#1f1f1f] text-[#ededed]"
                  : "text-[#a1a1a1] hover:text-[#ededed]",
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2 ml-auto">
        <span className="font-mono text-[11px] text-[#6e6e6e] border border-[rgba(255,255,255,0.14)] rounded px-1.5 py-0.5" style={{ background: "#0a0a0a" }}>
          ⌘ K
        </span>
        <button
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-[rgba(255,255,255,0.14)] bg-transparent text-[#ededed] text-[13px] transition-colors hover:bg-[#0f0f0f] hover:border-[rgba(255,255,255,0.22)]"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 17l6-6-6-6M12 19h8" />
          </svg>
          Terminal
        </button>
        <button
          onClick={() => openNewIssue()}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-white text-black text-[13px] font-medium border border-white transition-colors hover:bg-[#f4f4f4]"
          style={{ boxShadow: "0 0 22px rgba(255,255,255,.18)" }}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          New Chat
        </button>
        <div className="w-7 h-7 rounded-full shrink-0" style={{ background: "linear-gradient(135deg, #4ea8ff, #b964ff)", border: "1px solid rgba(255,255,255,0.14)" }} />
      </div>
    </div>
  );
}
