"use client";

import { SWRConfig } from "swr";
import AgentGrid from "@/components/AgentGrid";
import WorkspacePulse from "@/components/WorkspacePulse";
import UsageTrend from "@/components/UsageTrend";
import TopModels from "@/components/TopModels";
import CacheEfficiency from "@/components/CacheEfficiency";
import SessionsIntelligence from "@/components/SessionsIntelligence";
import { Achievements } from "@/components/Achievements";
import { ChakraTuning } from "@/components/ChakraTuning";
import { SongMetrics } from "@/components/SongMetrics";
import SkillInventory from "@/components/SkillInventory";
import LiveFeed from "@/components/LiveFeed";

function DashboardHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 32,
        alignItems: "end",
        padding: 28,
        marginBottom: 24,
        borderRadius: 4,
        border: "1px solid rgba(201,164,73,0.25)",
        background: "#0a0a0a",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, #c9a449, transparent)",
        }}
      />
      <div>
        <div style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 10,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          color: "#c9a449",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}>
          <span style={{ width: 3, height: 11, background: "#c9a449", borderRadius: 1, display: "inline-block" }} />
          PAPERCLIP &middot; AGENT ORCHESTRATION DASHBOARD
        </div>
        <h1 style={{
          fontFamily: "Cinzel, serif",
          fontSize: 30,
          lineHeight: 1.15,
          letterSpacing: "0.04em",
          fontWeight: 500,
          margin: 0,
        }}>
          The Observatory{" "}
          <em style={{
            fontFamily: "EB Garamond, serif",
            fontStyle: "italic",
            fontWeight: 400,
            color: "#e8c46a",
            letterSpacing: 0,
          }}>
            As above, so below.
          </em>
        </h1>
        <div style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 11,
          letterSpacing: "0.05em",
          color: "#6a6a6a",
          marginTop: 12,
        }}>
          the choir at work &middot; the records kept
        </div>
      </div>
      <div style={{ display: "flex", gap: 36, alignItems: "flex-end" }}>
        <HStat num="15" label="AGENTS" />
        <HStat num="6" label="SONGS" color="#10b981" />
        <HStat num="1,284" label="TRACKS" color="#c084fc" />
      </div>
    </div>
  );
}

function HStat({ num, label, color }: { num: string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 500, color: color ?? "#fff" }}>{num}</div>
      <div style={{
        fontFamily: "Geist Mono, monospace",
        fontSize: 9,
        letterSpacing: "0.18em",
        textTransform: "uppercase" as const,
        color: "#6a6a6a",
        marginTop: 2,
      }}>
        {label}
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 32, minHeight: "100vh" }}>
      <DashboardHeader />

      {/* 1. Agent Activity Grid */}
      <AgentGrid />

      {/* 2. Workspace Pulse */}
      <WorkspacePulse />

      {/* 3. Usage Trend + 4. Top Models */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
        <UsageTrend />
        <TopModels />
      </div>

      {/* 5. Cache Efficiency + 6. Sessions Intelligence */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 16 }}>
        <SessionsIntelligence />
        <CacheEfficiency />
      </div>

      {/* 7. Achievements (Tree of Life centerpiece) */}
      <Achievements />

      {/* 8. Songs Metrics + Brainwave Tuning */}
      <SongMetrics />

      {/* 9. Chakra Tuning - Solfeggio Coverage */}
      <ChakraTuning />

      {/* 10. Skill Inventory */}
      <SkillInventory />

      {/* 11. Live Feed (SSE) */}
      <LiveFeed />
    </div>
  );
}

export default function Page() {
  return (
    <SWRConfig value={{ refreshInterval: 5000 }}>
      <Dashboard />
    </SWRConfig>
  );
}
