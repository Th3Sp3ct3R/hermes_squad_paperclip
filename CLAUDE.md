# Paperclip — Claude Code Context

## What this project is

**Paperclip** is a multi-tenant AI agent orchestration platform — think Linear-for-agents. Frontend: Vite + React + TanStack Query at `ui/`. Backend: Express + Drizzle/Postgres at `server/`. Shared types in `packages/`.

Default dev port: **3100** (Vite proxies `/api/*` to the backend).

---

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
| Michael | Commander — assigns agents, dispatches issues |
| Uriel | Sound Prompt Engineer — writes Suno description text |
| Zadkiel | Lyricist — chakra-resonant lyrics or `[Instrumental]` |
| Jophiel | Visual Art — cover art prompt, calls image-gen |
| Raziel | Suno browser automation — drives Suno UI for A-side |
| Raphael | Reviewer / Gatekeeper — approves or rejects |
| Gabriel | Release Copy — caption, hashtags, release notes (JSON) |
| Sandalphon | Publisher — ships to DistroKid |
| Metatron | Activity log / timeline reader |

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

## Key Related Components

- `ui/src/components/ChakraFrequencyMap.tsx` — visual frequency map
- `ui/src/components/SacredGeometry.tsx` — ChakraYantra spinner
- `ui/src/components/ArchangelAvatar.tsx` — ArchangelAvatarStack
- `ui/src/lib/useAudioAmplitude.ts` — audio pulse hook

## Git Branch

Active branch: `feat/suno-pipeline`

## Org

Default org slug: `THE` — route: `/THE/suno-pipeline`
