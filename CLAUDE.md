# Paperclip — Claude Code Context

## What this project is

**Paperclip** is a multi-tenant AI agent orchestration platform — think Linear-for-agents. Frontend: Vite + React + TanStack Query at `ui/`. Backend: Express + Drizzle/Postgres at `server/`. Shared types in `packages/`.

Default dev port: **3100** (Vite proxies `/api/*` to the backend).

**Stable local run (recommended on Mac):** `pnpm dev:static` serves a prebuilt UI from `server/ui-dist` and does **not** embed Vite in the server process (avoids `exit 137` OOM from `PAPERCLIP_UI_DEV_MIDDLEWARE`). Requires external Postgres in `~/.paperclip/instances/default/.env` (`DATABASE_URL`, `SERVE_UI=true`). First run builds UI if `server/ui-dist` is missing; rebuild after UI changes with `pnpm prepare:ui-dist`.

---

## Metatron Front Door

Metatron is the user-facing cross-project orchestrator for Vanta Labs. In Paperclip, the canonical HTTP entry point is:

- `POST /api/metatron/orchestrate`
- Alias: `POST /api/hermes/orchestrate`
- Implementation: `server/src/hermes/index.ts`
- Canonical context: `~/Desktop/VAN/agents/metatron/`

Paperclip loads Metatron's VAN context (`SOUL.md`, `USER.md`, `REGISTRY.md`, `ROUTING.md`) into the Metatron communicator prompt when available. This makes Paperclip the current command surface for routing coding tasks across Paperclip, VAN, InstaGrowth, and OpenClaw.

Metatron decides what and where. Domain systems decide how.

## The Suno Pipeline

The primary active feature. An autonomous music production pipeline with a full state machine and named archangel agents.

**File locations:**
- UI page: `ui/src/pages/SunoPipeline.tsx`
- API client: `ui/src/api/sunoPipeline.ts`
- Server routes: `server/src/routes/suno-pipeline.ts`
- LLM service: `server/src/services/suno-llm.ts`
- DB schema: `packages/db/src/schema/sunoIssues.ts`
- Music gen: `server/src/services/minimax-music.ts`
- Cover art: `server/src/services/cover-art-gen.ts`

**Status machine:** `DRAFT → GENERATING → REVIEW → APPROVED → PUBLISHED` (+ `FAILED`)

**Archangel agents and their roles:**
| Agent | Role |
|-------|------|
| Michael | Suno domain commander — assigns agents, dispatches issues inside the music pipeline |
| Uriel | Sound Prompt Engineer — writes Suno description text |
| Zadkiel | Lyricist — chakra-resonant lyrics or `[Instrumental]` |
| Jophiel | Visual Art — cover art prompt, calls image-gen |
| Raziel | Suno browser automation — drives Suno UI for A-side |
| Raphael | Reviewer / Gatekeeper — approves or rejects |
| Gabriel | Release Copy — caption, hashtags, release notes (JSON) |
| Sandalphon | Publisher — ships to DistroKid |
| Metatron | Cross-project orchestrator / user voice — routes intent, reads VAN registry, delegates Suno production to Michael |

**LLM:** `minimax/minimax-m2.5:free` via OpenRouter. Env: `OPENROUTER_API_KEY`.

**Audio variants:** Suno A-side (browser, Raziel) + MiniMax B-side (server-side, free). Raphael picks the winner via `canonAudioVariant`.

**autoRun endpoint:** `POST /api/suno-pipeline/:id/auto-run` — end-to-end autonomous run (lyrics → soundPrompt → visualPrompt → music → releaseCopy → REVIEW).

---

## The Null Angel Sound Identity

This is the aesthetic constraint for ALL generated prompts. Inject as `hints` in any generate call or bake into Uriel/Zadkiel system prompts.

```json
{
  "preset_id": "vanta_architect_master_v1",
  "vocal_policy": "no vocals — always [Instrumental] in Suno lyrics box",
  "rhythm_policy": "no obvious rhythm unless minimal sparse kicks",
  "frequency_bias": "low-mid dominant, rolled-off highs",
  "textures": ["sub_bass_hum", "slow_evolving_drones", "mechanical_air", "cathedral_space_ir", "server_room_resonance"],
  "avoid": ["percussion", "vocals", "brightness", "uplifting_major_progressions", "cinematic_risers", "sudden_transients"]
}
```

**Universal Suno exclude styles:**
```
vocals, singing, lyrics, pop, edm, energetic, upbeat, trap hi-hats, drill, buildup, drop, cheerful, bright, major key, acoustic guitar, country, folk, reggaeton
```

---

## Chakra Frequency System

| Chakra | Hz | Use Case |
|--------|----|----------|
| ROOT | 396 | Grounding, gym, shadow work |
| SACRAL | 417 | Night drive, transformation |
| SOLAR | 528 | Morning walk, clarity |
| HEART | 639 | Creative flow, wind-down |
| THROAT | 741 | Vocal beats |
| THIRD_EYE | 852 | Deep coding, architect mode |
| CROWN | 963 | Sleep descent, void state |

---

## Mood Presets

These are the pre-configured moods for one-click beat generation. Each maps to a concept, chakra, genre, and BPM hint. The UI should expose these as clickable chips on the SunoPipeline page.

```typescript
export const MOOD_PRESETS = [
  {
    id: "deep-coding",
    label: "Deep Coding",
    emoji: "🖥",
    concept: "3am server room, one dim monitor, hypnotic repetitive minimal. Dark sub-bass pulse, sparse kick, no hooks, flat energy. Loop forever.",
    targetChakra: "THIRD_EYE",
    genre: "dark minimalist hip-hop, ambient trap, lo-fi industrial",
    hints: { bpm: 96, identity: "vanta_architect_master_v1" },
  },
  {
    id: "night-drive",
    label: "Night Drive",
    emoji: "🌙",
    concept: "Driving through an empty city at 2am with tinted windows. Deep 808 slides, haunted piano loop, sparse hi-hats, menacing but controlled.",
    targetChakra: "SACRAL",
    genre: "dark trap, phonk, memphis rap instrumental, cinematic hip-hop",
    hints: { bpm: 75, identity: "vanta_architect_master_v1" },
  },
  {
    id: "creative-flow",
    label: "Creative Flow",
    emoji: "🎨",
    concept: "Golden hour through a dusty window. Warm Rhodes, soft brushed snare, subtle bass groove, tape hiss. Calm confidence, unhurried mastery.",
    targetChakra: "HEART",
    genre: "lo-fi hip-hop, ambient jazz, chill instrumental, warm analog",
    hints: { bpm: 85, identity: "vanta_architect_master_v1" },
  },
  {
    id: "shadow-work",
    label: "Shadow Work",
    emoji: "🔮",
    concept: "Controlled descent, sinking into warm black water. One evolving dark pad with slow amplitude modulation at 6 cycles per second. No resolution.",
    targetChakra: "ROOT",
    genre: "dark ambient, drone, ethereal bass music, witch house",
    hints: { bpm: 70, thetaHz: 6.0, identity: "vanta_architect_master_v1" },
  },
  {
    id: "gym-run",
    label: "Gym / Run",
    emoji: "💪",
    concept: "Controlled rage, not reckless anger. A machine, not an animal. Distorted 808 kicks, industrial metallic textures, relentless forward momentum.",
    targetChakra: "ROOT",
    genre: "dark industrial hip-hop, aggressive trap, grime instrumental, phonk",
    hints: { bpm: 140, identity: "vanta_architect_master_v1" },
  },
  {
    id: "morning-walk",
    label: "Morning Walk",
    emoji: "🚶",
    concept: "A man walking through cold air with purpose. Not celebrating, not mourning — just moving. Chopped soul sample, punchy boom-bap, quiet strength.",
    targetChakra: "SOLAR",
    genre: "boom bap, instrumental hip-hop, golden era beats, dusty samples",
    hints: { bpm: 90, identity: "vanta_architect_master_v1" },
  },
  {
    id: "wind-down",
    label: "Wind Down",
    emoji: "🍳",
    concept: "Cooking something good alone in a clean kitchen with low lighting. Warm bassline, gentle keys, comfortable solitude, no urgency at all.",
    targetChakra: "HEART",
    genre: "lo-fi hip-hop, chillhop, smooth jazz beats, ambient R&B instrumental",
    hints: { bpm: 80, identity: "vanta_architect_master_v1" },
  },
  {
    id: "sleep-descent",
    label: "Sleep",
    emoji: "😴",
    concept: "Floating in a sealed black vault. Single low drone evolving imperceptibly. No rhythm, no emotion, pure neutral descent. Loop at very low volume.",
    targetChakra: "CROWN",
    genre: "dark ambient, drone, sleep music, deep space, minimal electronic",
    hints: { bpm: 0, identity: "vanta_architect_master_v1" },
  },
] as const;
```

---

## The Observatory (`/THE/dashboard`)

The dashboard is named **The Observatory** in the UI (icon ☉ Sun / Tiphareth — solar sphere of beauty). The page reframes generic AI-ops metrics through a Hermetic / alchemical lens.

Header runs the **Tabula Smaragdina** axiom across the top in italic small caps:

> Quod est superius est sicut quod est inferius — *as above, so below*

Every panel section header carries a **Caduceus glyph** (`<CaduceusMark />`, inline SVG, `currentColor`-driven) instead of the legacy lightsaber chevron. Color modifiers on `.seclabel` (b/r/p/w/g/s/e) tint the caduceus + glow per section.

### Hermetic Vocabulary (panel name → meaning → data source)

**Renames** (existing panels relabeled):

| Was | Now | Meaning |
|---|---|---|
| Sessions Intelligence | The Hermetica | Corpus of Hermes Trismegistus' dialogues — the system's recorded conversations |
| Skill Inventory | The Grimoire | Magician's spellbook — list of agent operations |
| Live Feed / Agent Activity | The Akashic Stream | Theosophical cosmic record — Metatron's domain (matches `m3t4tr0n` in activity log) |
| Top Genres | Modes | Greek musical modes (Dorian, Phrygian, Mixolydian) |
| Brainwave Tuning | Harmonic Telemetry / The Tuning | Music-theory diagnostics |
| Usage Trend | The Ephemeris | Astronomical table of planetary positions over time |
| Top Models | The Daemons | Greek **δαίμων** — intermediary spirit. Each LLM IS a daemon |
| Cache Efficiency | Memoria | Latin "memory" — the Hermetic Art of Memory (Frances Yates) |

**New Phase 1 panels** (`ui/src/components/dashboard/HermeticPanels.tsx`):

| Panel | Meaning | Data |
|---|---|---|
| **The Magnum Opus** | Alchemy's Great Work — Nigredo (DRAFT) → Albedo (GENERATING) → Citrinitas (REVIEW) → Rubedo (APPROVED) → Lapis (PUBLISHED) → Solutio (FAILED) | `suno_issues` grouped by status |
| **Solve et Coagula** | "Dissolve and coagulate" — alchemical motto | activity log: `suno_issue.rejected` events followed later by `.approved` |
| **The Eighth Sphere** | 7 planetary spheres + 8th of fixed stars beyond Fate | songs that shipped externally (PUBLISHED count + last ship date) — motto **ἕν τὸ πᾶν** |
| **Hermes' Errands** | Hermes the messenger god — *Iliad* 24.339 | tool-call ledger today (suno + agent + tool actions) |
| **The Ouroboros** | Snake biting its own tail — eternal return | retry loops + self-healing events (heartbeat invocations, recovered runs) |

**New Phase 2 panels** (`ui/src/components/dashboard/HermeticMechanism.tsx`):

| Panel | Source | Data |
|---|---|---|
| **The Planetary Hour** | Heptameron / Agrippa Bk II — Chaldean order Saturn → Jupiter → Mars → Sun → Venus → Mercury → Moon | current hour's ruler + archangel + countdown to next |
| **The Heptachord** | Hymn 4 — *septem chordae mundi* (Pythagorean / Orphic) | 7-string SVG, one per chakra/planet at its Solfeggio Hz; brightness = PUBLISHED count in band |
| **The Monochord** | Robert Fludd, *Utriusque Cosmi* (1617) — single string with 7 planetary stops | Pythagorean ratios 0/8 · 1/8 · 2/8 · 4/8 (mese) · 5/8 · 6/8 · 7/8; pulses on fresh PUBLISHED |

**New Phase 3 panels** (`ui/src/components/dashboard/HermeticTelemetry.tsx`):

| Panel | Source | Data |
|---|---|---|
| **The Aspect Grid** | Astrology — ☌ conjunction, ☍ opposition, △ trine | top 6 archangel pairs from activity-log co-occurrence (responsible-agent derived from action keywords when `agentId` is null) |
| **The Kerykeion** | Greek for Hermes' staff (Latin: caduceus) — two serpents coiled around a winged rod | live agent-to-agent message graph SVG + top 3 message-volume pairs today |

### Planet → Archangel mapping (used by Planetary Hour, Aspect Grid, Kerykeion)

| Planet | Archangel | Sphere |
|---|---|---|
| Saturn | Cassiel | Binah |
| Jupiter | Zadkiel | Chesed |
| Mars | Michael | Geburah |
| Sun | Raphael | Tiphareth |
| Venus | Uriel | Netzach |
| Mercury | Raziel | Hermes / mysteries |
| Moon | Gabriel | Yesod |

(Metatron, Jophiel, Sandalphon sit outside the seven planetary hours — Keter / Chokmah-secondary / Malkuth.)

### Activity log → archangel resolution

The activity log records most events with `actorType="user"` and no explicit `agentId` (operations come via HTTP routes without an archangel context). The Telemetry panels handle this with a `deriveResponsibleAgent(action)` helper (in `HermeticTelemetry.tsx`) that maps action keywords to the responsible archangel:

* `*lyrics*` → Zadkiel
* `*soundPrompt*` → Uriel
* `*visualPrompt* / *cover_art*` → Jophiel
* `*releaseCopy*` → Gabriel
* `*minimax* / *audioUrl*` → Raziel
* `*publish*` → Sandalphon
* `*approve* / *review_request* / *reject* / *canon*` → Raphael
* `*dispatch* / *assign* / *auto_run*` → Michael
* `*triage* / *failed_stale*` → Cassiel
* `*linked_to_issue* / *backfilled*` → Metatron

Long-term fix: backend should set `agentId` on activity rows when an archangel is the actor. Until then, derivation works.

---

## Key Related Components

- `ui/src/components/ChakraFrequencyMap.tsx` — visual frequency map
- `ui/src/components/SacredGeometry.tsx` — ChakraYantra + sphere geometries
- `ui/src/components/ArchangelAvatar.tsx` — ArchangelAvatarStack
- `ui/src/components/CaduceusMark.tsx` — Hermes' staff section glyph
- `ui/src/components/dashboard/HermeticPanels.tsx` — Magnum Opus / Solve et Coagula / Eighth Sphere / Hermes' Errands / Ouroboros
- `ui/src/components/dashboard/HermeticMechanism.tsx` — Planetary Hour / Heptachord / Monochord
- `ui/src/components/dashboard/HermeticTelemetry.tsx` — Aspect Grid / Kerykeion
- `ui/src/lib/useAudioAmplitude.ts` — audio pulse hook

## Git Branch

Active branch: `feat/suno-pipeline`

## Org

Default org slug: `THE` — route: `/THE/suno-pipeline`
