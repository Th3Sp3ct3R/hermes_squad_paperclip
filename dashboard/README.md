# Agent Dashboard

Three-track achievement system + workspace pulse, wired to a real SQLite backend.

## Setup

```bash
pnpm install
pnpm db:push    # create tables from schema
pnpm seed       # insert demo data (15 agents, 6 songs, 63 listen sessions, 31d usage, 247 timeline events)
pnpm dev        # http://localhost:3200
```

## Stack

- **Next.js 14** App Router + TypeScript
- **Drizzle ORM** + better-sqlite3 (SQLite)
- **SWR** (5s polling) + **EventSource** SSE for live feed
- **Recharts** for area/bar charts
- **Tailwind CSS** + Geist + Cinzel + EB Garamond fonts

## Dashboard Sections (top to bottom)

1. **AgentGrid** — 15-agent fleet with geometric SVG icons, status pills, progress bars
2. **WorkspacePulse** — 4 stat cards (sessions/tokens/API calls/active model) with sparklines
3. **UsageTrend** — Recharts area chart (30D, purple gradient) + period selector
4. **TopModels** — ranked list with progress bars
5. **CacheEfficiency** — bar chart (hits green / misses red) by week
6. **SessionsIntelligence** — recent sessions list with model/kind tags
7. **Achievements** — Tree of Life SVG + 12 Golden Dawn grade ladder + 11 archangelic sigils
8. **SongMetrics** — brainwave bands (theta/alpha/beta/delta) + now-playing waveform + top genres
9. **ChakraTuning** — 7 solfeggio cells with mini waveforms + Da'ath gate flagging
10. **SkillInventory** — pill grid with status badges
11. **LiveFeed** — SSE-streamed terminal feed with auto-scroll

## API Routes

| Route | Data |
|-------|------|
| `/api/agents` | 15 agents with status/progress |
| `/api/usage` | 31 days of token/call/cache data + model rankings |
| `/api/achievements` | Grade computation + sigil state |
| `/api/chakras` | Track counts + listen duration per chakra |
| `/api/songs/metrics` | Brainwave bands, deep focus %, genres, now-playing |
| `/api/sessions` | Recent coding sessions |
| `/api/cache` | Weekly cache hit/miss breakdown |
| `/api/skills` | Skill inventory with status |
| `/api/feed/stream` | SSE endpoint (timeline events + synthetic heartbeats) |

## Components

- **Waveform** — reusable: bars, line, mirror, pulse variants with deterministic mock peaks
- **SectionShell** — reusable section container matching the InitiatesPath design language
