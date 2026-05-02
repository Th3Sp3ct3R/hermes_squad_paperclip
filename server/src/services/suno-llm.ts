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
import { logger } from "../middleware/logger.js";

const OPENROUTER_BASE =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

/**
 * Per-archangel default model. All :free for now per The Architect's directive.
 * Tunable per call via the {@link callOpenRouter} `model` option, and the
 * fallback can be overridden at process scope via OPENROUTER_MODEL.
 */
export const SUNO_MODELS = {
  /** Zadkiel — lyrics, creative writing. Larger model for poetic depth. */
  lyrics: "meta-llama/llama-3.3-70b-instruct:free",
  /** Uriel — Suno description text, structured + tag-heavy. Smaller is fine. */
  soundPrompt: "meta-llama/llama-3.3-70b-instruct:free",
  /** Jophiel — image gen prompt, vivid sensory detail. */
  visualPrompt: "meta-llama/llama-3.3-70b-instruct:free",
  /** Gabriel — release notes, social copy. Voice-y and tight. */
  releaseCopy: "meta-llama/llama-3.3-70b-instruct:free",
} as const;

const FALLBACK_MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";

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
}

/**
 * Make a single chat-completion call to OpenRouter. Returns the assistant's
 * trimmed text content. Throws on auth failure, network error, or empty
 * response.
 */
export async function callOpenRouter(opts: OpenRouterCallOpts): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if ((opts.requireKey ?? true) && !key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured — set it in the server env to use suno generation",
    );
  }

  const model = opts.model ?? FALLBACK_MODEL;
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
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("OpenRouter returned no content");
  }

  const elapsedMs = Date.now() - startedAt;
  const promptTokens = data.usage?.prompt_tokens ?? "?";
  const completionTokens = data.usage?.completion_tokens ?? "?";
  logger.info(
    `[suno-llm] call complete model=${model} elapsedMs=${elapsedMs} promptTokens=${promptTokens} completionTokens=${completionTokens}`,
  );

  return content.trim();
}

// ── Prompt builders ────────────────────────────────────────────────────────
// Each archangel has a system prompt that locks in their voice + a user
// message that injects the song's context. Output contracts are kept
// machine-friendly (no prose preambles, no markdown explanations).

export function buildLyricsPrompt(ctx: SunoLlmContext): ChatMessage[] {
  return [
    {
      role: "system",
      content: `You are Zadkiel, the Lyricist Archangel. You write lyrics that resonate with chakra frequencies and brain-state entrainment.

Output contract:
- Lyrics ONLY. No preamble. No explanation. No markdown headers.
- Use [Verse 1], [Chorus], [Verse 2], [Bridge], [Outro] structure markers.
- 180–360 words total.
- Style: poetic, layered, emotionally precise. Avoid cliche. Avoid AI tells.

Embody the chakra's energy in the imagery and cadence. Match the genre's natural diction.`,
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra} (${ctx.targetFrequency} Hz Solfeggio carrier)`,
        `Genre: ${ctx.genre ?? "open"}`,
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
  return [
    {
      role: "system",
      content: `You are Uriel, the Sound Prompt Engineer Archangel. You compose the description text that goes into Suno's "Song Description" field for music generation.

Output contract:
- A SINGLE paragraph, 60–180 words.
- No markdown. No preamble. No headers.
- Lead with the genre + BPM if known, then mood, then key sonic elements (drum pattern, bass texture, harmonic palette, vocal treatment).
- Reference the chakra's Solfeggio frequency as a carrier where it makes musical sense (e.g. "639 Hz carrier tones in the pad").
- Avoid generic adjectives ("amazing", "beautiful"). Be specific and producible.

The output goes verbatim into Suno's UI — no quotes, no labels.`,
    },
    {
      role: "user",
      content: [
        `Concept: ${ctx.concept}`,
        `Target chakra: ${ctx.targetChakra} (${ctx.targetFrequency} Hz)`,
        `Genre: ${ctx.genre ?? "open"}`,
        ctx.lyrics ? `Lyrics already written:\n${ctx.lyrics.slice(0, 1500)}` : null,
        ctx.hints && Object.keys(ctx.hints).length > 0
          ? `Hints: ${JSON.stringify(ctx.hints)}`
          : null,
        "",
        "Write the Suno song description now.",
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
      content: `You are Jophiel, the Visual Art Archangel. You compose image-generation prompts for cover art that reflects the song's chakra energy and mood.

Output contract:
- A SINGLE paragraph, 50–140 words.
- No markdown. No preamble.
- Specify: scene/composition, color palette (matched to chakra), lighting, atmosphere, art style/medium, aspect ratio (1:1 square for cover).
- Avoid text-in-image instructions (image gens are bad at text).
- Avoid cliche ("vibrant", "stunning"). Be sensory and specific.

The output is fed directly to an image-gen API (FAL / Gemini Image / SDXL).`,
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
        "Write the cover-art prompt now.",
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
