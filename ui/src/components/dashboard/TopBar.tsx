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
      {/* Logo */}
      <div
        className="w-9 h-9 rounded grid place-items-center border border-[rgba(255,255,255,0.14)] shrink-0"
        style={{ background: "#0a0a0a" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]">
          <path d="M4 20 L8 4 L12 14 L16 4 L20 20" stroke="#ededed" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.6" fill="#ededed" />
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
