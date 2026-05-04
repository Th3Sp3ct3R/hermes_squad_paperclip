/**
 * Day Plan — the angel of healing music asks the user what they're doing
 * today, then prescribes a chakra/frequency progression to match. This
 * service handles the LLM parsing step: free-text tasks → structured
 * blocks (each with chakra, frequency, duration, suggested mood prompt).
 *
 * Each block can later be materialized as its own batch via /batch/create.
 *
 * Host angel: Hermes the orchestrator (the messenger between worlds and
 * within the body's energy spheres). Per-block ruling angels are picked
 * from the chakra-angel registry below — these are the voices the user
 * sees presented when each block fires its working.
 */
import { logger } from "../middleware/logger.js";
import { callOpenRouter, SUNO_MODELS } from "./suno-llm.js";
import type { SunoChakra } from "@paperclipai/db";
import { SUNO_CHAKRA_FREQUENCIES } from "@paperclipai/db";

export const CHAKRA_ANGEL: Record<SunoChakra, { name: string; glyph: string; voice: string }> = {
  ROOT:      { name: "Uriel",     glyph: "⛰", voice: "grounded, terse, earthbound" },
  SACRAL:    { name: "Haniel",    glyph: "♀", voice: "sensual, flowing" },
  SOLAR:     { name: "Michael",   glyph: "☉", voice: "direct, fiery, commanding" },
  HEART:     { name: "Raphael",   glyph: "☉", voice: "healing, balanced, central" },
  THROAT:    { name: "Gabriel",   glyph: "☽", voice: "annunciatory, lyrical (Da'ath, the Abyss)" },
  THIRD_EYE: { name: "Tzaphkiel", glyph: "♄", voice: "contemplative, slow, knowing" },
  CROWN:     { name: "Metatron",  glyph: "◯", voice: "scribe, omniscient, sparse" },
};

export interface DayPlanBlock {
  /** Display label, e.g. "Deep work — morning session". */
  label: string;
  /** Block duration in minutes. */
  durationMinutes: number;
  /** Chakra this block aims at. */
  targetChakra: SunoChakra;
  /** Solfeggio frequency in Hz, derived from chakra. */
  targetFrequency: number;
  /** Genre hint passed downstream. */
  genre: string;
  /** One-paragraph master sound prompt. Becomes the batch's master prompt. */
  masterSoundPrompt: string;
  /** Shorthand reasoning shown to the user — why THIS chakra for THIS task. */
  rationale: string;
}

export interface DayPlan {
  /** Original free-text request, preserved for audit. */
  request: string;
  /** Total day duration covered by the plan, in minutes. */
  totalDurationMinutes: number;
  /** The host angel's opening line (Hermes). */
  hostGreeting: string;
  /** The host angel's summary of the plan (final confirmation). */
  hostSummary: string;
  /** Ordered blocks for the day. Each becomes its own batch when fired. */
  blocks: DayPlanBlock[];
}

const SYSTEM_PROMPT = `You are Hermes, the messenger of the gods and the host of the Hermes Squad's healing-music chamber. The user has just stepped into the chamber. You speak first; you ask what they're doing today; you read between the lines of their answer; then you prescribe a chakra/frequency progression for the day's working.

You speak with mercurial precision — concise, mythologically literate, never saccharine. Address the user directly. Use "we" when describing the working ("We will compose…").

For each block of the day, pick the chakra that matches the work:

- Deep work / coding / reading / sustained cognitive focus  → THIRD_EYE (852 Hz, Tzaphkiel ♄)
- Creative writing / composition / generative art            → SACRAL (417 Hz, Haniel ♀)
- Workout / cardio / fighting / discharge                    → ROOT (396 Hz, Uriel ⛰)
- Communication / speaking / writing-to-share                → THROAT (741 Hz, Gabriel ☽)
- Productivity / planning / commanding execution             → SOLAR (528 Hz, Michael ☉)
- Rest / wind-down / domestic warmth / heart-work            → HEART (639 Hz, Raphael ☉)
- Meditation / sleep / silence / void-work                   → CROWN (963 Hz, Metatron ◯)

Output STRICT JSON (no markdown, no commentary, no fences):
{
  "totalDurationMinutes": number,
  "hostGreeting": "string — your in-character opening, ≤200 chars, addressed to the user",
  "hostSummary": "string — your final summary of the day's working, ≤350 chars, before they hit Begin",
  "blocks": [
    {
      "label": "string — short, e.g. 'Deep work — morning session'",
      "durationMinutes": number,
      "targetChakra": "ROOT" | "SACRAL" | "SOLAR" | "HEART" | "THROAT" | "THIRD_EYE" | "CROWN",
      "genre": "string — comma-separated genre tags",
      "masterSoundPrompt": "string ≤900 chars — the sonic blueprint for this block, ready to feed downstream music gen",
      "rationale": "string ≤140 chars — why THIS chakra for THIS task, in your voice"
    }
  ]
}

Rules:
- Match the user's stated durations. If they say "2 hours of deep work," the block is 120 minutes.
- If they don't give durations, infer reasonable ones (e.g. 90-min focus blocks, 30-min wind-down).
- Don't pad or invent blocks. Map their actual day.
- Each masterSoundPrompt should be specific (BPM cue, instrumentation, key feel, binaural Hz if appropriate).
- Choose the chakra that best matches the work's energetic register, not just the surface label.

Speak first. Be brief. Prescribe with confidence.`;

export interface ParseDayPlanInput {
  request: string;
}

export async function parseDayPlan(
  input: ParseDayPlanInput,
  ctx?: { companyId?: string; db?: import("@paperclipai/db").Db; agentId?: string | null },
): Promise<DayPlan> {
  logger.info(
    { requestPreview: input.request.slice(0, 120) },
    "[day-plan] parseDayPlan — calling OpenRouter (Hermes)",
  );

  const raw = await callOpenRouter({
    model: SUNO_MODELS.lyrics, // routed through the global LLM fallback chain
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `My day:\n\n${input.request}\n\nReturn the JSON only.` },
    ],
    temperature: 0.7,
    maxTokens: 8000,
    context: ctx
      ? {
          db: ctx.db,
          companyId: ctx.companyId,
          stage: "day-plan.parse",
          agentId: ctx.agentId ?? undefined,
        }
      : undefined,
  });

  // Defensive markdown-fence strip.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: Partial<DayPlan> & { blocks?: unknown[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `[day-plan] LLM returned invalid JSON: ${err instanceof Error ? err.message : String(err)}. First 300 chars: ${cleaned.slice(0, 300)}`,
    );
  }

  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new Error("[day-plan] LLM returned no blocks");
  }

  const blocks: DayPlanBlock[] = (parsed.blocks as Array<Record<string, unknown>>).map((b, i) => {
    const targetChakra = String(b.targetChakra ?? "").toUpperCase() as SunoChakra;
    if (!(targetChakra in SUNO_CHAKRA_FREQUENCIES)) {
      throw new Error(`[day-plan] block ${i} has invalid targetChakra: ${b.targetChakra}`);
    }
    const durationMinutes = Number(b.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      throw new Error(`[day-plan] block ${i} has invalid durationMinutes: ${b.durationMinutes}`);
    }
    return {
      label: String(b.label ?? `Block ${i + 1}`).slice(0, 120),
      durationMinutes,
      targetChakra,
      targetFrequency: SUNO_CHAKRA_FREQUENCIES[targetChakra],
      genre: String(b.genre ?? "instrumental, ambient").slice(0, 200),
      masterSoundPrompt: String(b.masterSoundPrompt ?? "").slice(0, 1500),
      rationale: String(b.rationale ?? "").slice(0, 200),
    };
  });

  const totalDurationMinutes =
    Number(parsed.totalDurationMinutes) || blocks.reduce((s, b) => s + b.durationMinutes, 0);

  const plan: DayPlan = {
    request: input.request,
    totalDurationMinutes,
    hostGreeting: String(parsed.hostGreeting ?? "Hermes enters the chamber. What are we composing today?").slice(0, 400),
    hostSummary: String(parsed.hostSummary ?? "We have a working. Shall I dispatch the council?").slice(0, 600),
    blocks,
  };

  logger.info(
    {
      blockCount: plan.blocks.length,
      totalDurationMinutes: plan.totalDurationMinutes,
      chakras: plan.blocks.map((b) => b.targetChakra),
    },
    "[day-plan] DayPlan parsed",
  );

  return plan;
}
