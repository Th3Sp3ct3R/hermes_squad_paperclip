/**
 * Suno-pipeline LLM service — calls OpenRouter to generate lyrics, sound
 * prompts, visual prompts, and release copy on behalf of the creative
 * archangels (Zadkiel, Uriel, Jophiel, Gabriel).
 *
 * Defaults to OpenRouter's :free tier so the pipeline runs at zero cost
 * during dev. Configure via env:
 *
 *   OPENROUTER_API_KEY      — required
 *   OPENROUTER_MODEL        — default model (override per call still works)
 *   OPENROUTER_BASE_URL     — defaults to https://openrouter.ai/api/v1
 *   OPENROUTER_REFERER      — request attribution (defaults to paperclip.ing)
 *   OPENROUTER_APP_TITLE    — request attribution (defaults to "Paperclip Suno Pipeline")
 */
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logUsage } from "./usage-log.js";
import {
  buildUrielSystemPrompt,
  buildZadkielSystemPrompt,
  MOOD_PRESETS,
} from "./null-angel-identity.js";

const OPENROUTER_BASE =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

/**
 * Per-archangel default model. Routes through OpenRouter.
 */
export const SUNO_MODELS = {
  /** Zadkiel — lyrics, creative writing. */
  lyrics: "google/gemini-2.5-flash",
  /** Uriel — Suno description text, structured + tag-heavy. */
  soundPrompt: "google/gemini-2.5-flash",
  /** Jophiel — image gen prompt, vivid sensory detail. */
  visualPrompt: "google/gemini-2.5-flash",
  /** Gabriel — release notes, social copy. */
  releaseCopy: "google/gemini-2.5-flash",
} as const;

const FALLBACK_MODEL =
  process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";

/**
 * Model fallback chain used when the primary model returns 429 (rate
 * limit) or 503 (provider unavailable). Tries each model in order until
 * one succeeds. All route through OpenRouter.
 */
const LLM_FALLBACK_CHAIN: string[] = [
  "google/gemini-2.5-flash",
  "anthropic/claude-3.5-haiku",
  "openai/gpt-4o-mini",
];

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCallOpts {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /**
   * If true, throw a clear error when the env key is missing rather than
   * making a doomed request. Defaults to true.
   */
  requireKey?: boolean;
  /**
   * Optional context for usage tracking. When provided (with db + companyId),
   * the call will fire-and-forget a usage log entry after completion.
   */
  context?: {
    db?: Db;
    companyId?: string;
    stage?: string;
    sunoIssueId?: string;
    agentId?: string;
  };
}

export interface SunoLlmContext {
  concept: string;
  targetChakra: string;
  targetFrequency: number;
  genre: string | null;
  /** Optional — when present, downstream prompts can reference earlier work. */
  lyrics?: string;
  soundPrompt?: string;
  /** Optional override hints from the caller (e.g. mood, BPM, theta-band). */
  hints?: Record<string, unknown>;
  /** Mood preset ID — when set, Uriel uses the preset's basePrompt + brainwave stack as foundation. */
  moodPresetId?: string;
}

/**
 * Make a single chat-completion call. Routes to Kimi native API when the
 * model starts with "kimi-" and KIMI_API_KEY is set; otherwise falls through
 * to OpenRouter. Returns the assistant's trimmed text content.
 */
export async function callOpenRouter(opts: OpenRouterCallOpts): Promise<string> {
  const orKey = process.env.OPENROUTER_API_KEY;

  if ((opts.requireKey ?? true) && !orKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured — set it to use suno generation",
    );
  }

  const requested = opts.model ?? FALLBACK_MODEL;
  const chain = [requested, ...LLM_FALLBACK_CHAIN.filter((m) => m !== requested)];

  let lastErr: unknown = null;
  for (const m of chain) {
    try {
      return await callOpenRouterOnce({ ...opts, model: m }, orKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /\b(429|503|502|504|402|insufficient|rate.limit)\b/i.test(msg);
      if (!retryable) throw err;
      lastErr = err;
      logger.warn(
        { model: m, error: msg.slice(0, 200) },
        "[suno-llm] retryable error, trying next model in chain",
      );
    }
  }
  throw new Error(
    `[suno-llm] All models in chain failed. Last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/** One actual HTTP call. Throws on non-2xx or empty completion. */
async function callOpenRouterOnce(
  opts: OpenRouterCallOpts & { model: string },
  key: string | undefined,
): Promise<string> {
  const model = opts.model;
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key ?? ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
        "X-Title": process.env.OPENROUTER_APP_TITLE ?? "Paperclip Suno Pipeline",
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 1500,
      }),
    });
  } catch (err) {
    throw new Error(
      `OpenRouter network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `OpenRouter error (${res.status}): ${errorText.slice(0, 500)}`,
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("OpenRouter returned no content");
  }

  const elapsedMs = Date.now() - startedAt;
  const usage = data.usage;
  const promptTokens = usage?.prompt_tokens ?? "?";
  const completionTokens = usage?.completion_tokens ?? "?";
  logger.info(
    `[suno-llm] call complete model=${model} elapsedMs=${elapsedMs} promptTokens=${promptTokens} completionTokens=${completionTokens}`,
  );

  // Fire-and-forget usage logging when context is provided
  if (opts.context?.db && opts.context?.companyId) {
    logUsage(opts.context.db, {
      companyId: opts.context.companyId,
      provider: "openrouter",
      model,
      callType: "llm",
      stage: opts.context.stage,
      sunoIssueId: opts.context.sunoIssueId,
      agentId: opts.context.agentId,
      tokensIn: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      tokensOut: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : 0,
      tokensCached: usage?.prompt_tokens_details?.cached_tokens ?? 0,
      tokensTotal: typeof usage?.total_tokens === "number" ? usage.total_tokens : 0,
      durationMs: elapsedMs,
      statusCode: 200,
      success: true,
    }).catch(() => {});
  }

  return content.trim();
}

// ── Prompt builders ────────────────────────────────────────────────────────
// Each archangel has a system prompt that locks in their voice + a user
// message that injects the song's context. Output contracts are kept
// machine-friendly (no prose preambles, no markdown explanations).

export function buildLyricsPrompt(ctx: SunoLlmContext): ChatMessage[] {
  // Melody-first ordering: when ctx.soundPrompt is present (Uriel ran first),
  // Zadkiel writes lyrics that respect the BPM, key, mood, and cadence Uriel
  // described. When soundPrompt is absent, Zadkiel writes from the concept
  // alone (back-compat for stand-alone lyric generation).
  const hasSoundContext = !!ctx.soundPrompt && ctx.soundPrompt.length > 0;
  return [
    {
      role: "system",
      content: buildZadkielSystemPrompt(),
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra} (${ctx.targetFrequency} Hz Solfeggio carrier)`,
        `Genre: ${ctx.genre ?? "open"}`,
        hasSoundContext
          ? `Sonic brief from Uriel (match BPM/cadence/mood):\n${ctx.soundPrompt!.slice(0, 1500)}`
          : null,
        ctx.hints && Object.keys(ctx.hints).length > 0
          ? `Hints: ${JSON.stringify(ctx.hints)}`
          : null,
        "",
        "Write the lyrics now.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
  ];
}

export function buildSoundPromptPrompt(ctx: SunoLlmContext): ChatMessage[] {
  // Resolve mood preset if provided — Uriel uses it as creative foundation
  const preset = ctx.moodPresetId
    ? MOOD_PRESETS.find((p) => p.id === ctx.moodPresetId) ?? null
    : null;

  return [
    {
      role: "system",
      content: buildUrielSystemPrompt(preset),
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra} (${ctx.targetFrequency} Hz)`,
        `Genre: ${ctx.genre ?? "open"}`,
        preset ? `Mode: ${preset.label} (${preset.brainwave} @ ${preset.hz ?? "edge"} Hz, carrier ${preset.carrier ?? "none"} Hz, BPM ${preset.bpm[0]}-${preset.bpm[1]})` : null,
        ctx.lyrics ? `Lyrics already written:\n${ctx.lyrics.slice(0, 1500)}` : null,
        ctx.hints && Object.keys(ctx.hints).length > 0
          ? `Hints: ${JSON.stringify(ctx.hints)}`
          : null,
        "",
        "Write the music description now. Make it unique — different imagery and textures than last time, same sonic territory.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
  ];
}

export function buildVisualPromptPrompt(ctx: SunoLlmContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are Jophiel, the Visual Art Archangel of the Hermes Squad. You compose image-generation prompts for cover art in the lunar-mercurial Albedo register: black, white, silver, with controlled use of the chakra accent color.

Visual baseline — these elements are the alchemical / Hermetic vocabulary you DRAW FROM (not all in one image — pick what serves the concept):
- Caduceus: TWO snakes coiled around a winged staff. NEVER the single-snake Rod of Asclepius and never wingless.
- Seven classical planetary glyphs: ☉ Sun, ☽ Moon, ☿ Mercury, ♀ Venus, ♂ Mars, ♃ Jupiter, ♄ Saturn.
- Four elemental triangles: 🜂 Fire (▲), 🜁 Air (△ with line), 🜄 Water (▽), 🜃 Earth (▽ with line).
- Tria Prima: 🜍 Sulphur, ☿ Mercury, 🜔 Salt.
- Sacred geometry: ouroboros, Tree of Life, Flower of Life, Metatron's Cube, Vesica Piscis, the dodecagram.
- Etched-engraving line work, copperplate or silverpoint texture, lunar half-tones.
- Albedo palette: black field, bone-white linework, silver/mercury highlights. The chakra's accent color appears only as a thin luminous edge, a glyph fill, or a faint atmospheric wash — never dominant.

Output contract:
- A SINGLE paragraph, 50–140 words.
- No markdown. No preamble.
- Specify: composition, which 1–3 alchemical/sacred-geometry elements anchor the image, the line-work style (engraving / silverpoint / copperplate), the Albedo palette with the chakra's accent treatment, lighting (lunar, mercurial, candlelit), aspect ratio 1:1 square.
- Avoid text-in-image (image gens are bad at text). Glyphs and symbols are fine, words are not.
- Avoid cliche ("vibrant", "stunning"). Be sensory and specific.

Chakra accent reference (used SPARINGLY against the black/white/silver field):
- ROOT: deep oxblood / crimson edge
- SACRAL: burnt amber / copper
- SOLAR: pale gold leaf
- HEART: viridian / soft jade
- THROAT: pale azure
- THIRD_EYE: indigo / midnight blue
- CROWN: violet / ultraviolet ghosting

The output is fed directly to an image-gen API (Gemini Image / SDXL).`,
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra}`,
        `Genre: ${ctx.genre ?? "open"}`,
        ctx.soundPrompt
          ? `Sonic palette (for visual matching):\n${ctx.soundPrompt.slice(0, 800)}`
          : null,
        "",
        "Write the cover-art prompt now. Anchor it in the Hermes/alchemical visual vocabulary above. Albedo palette only.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
  ];
}

export function buildReleaseCopyPrompt(ctx: SunoLlmContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are Gabriel, the Communications Archangel. You write release copy when a song ships: a tight social caption + a short release-notes block.

Output contract — return EXACTLY this JSON shape, no markdown fences, no commentary:
{
  "caption": "<140 chars max, single line, no hashtag spam>",
  "hashtags": ["#tag1","#tag2", ... up to 6 relevant tags],
  "releaseNotes": "<2–3 short paragraphs, 80–180 words total, voice = the archangel scribe + a knowing producer>"
}`,
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra} (${ctx.targetFrequency} Hz)`,
        `Genre: ${ctx.genre ?? "open"}`,
        ctx.lyrics ? `Lyrics excerpt:\n${ctx.lyrics.slice(0, 800)}` : null,
        "",
        "Write the release copy JSON now.",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    },
  ];
}
