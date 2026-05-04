/**
 * Suno Batch — NLP-driven bulk song generation.
 *
 * Takes a natural-language request like "10 hours of deep focus music" and
 * produces a structured BatchPlan: master sound parameters + N per-song
 * variations (each with a unique title and a slightly varied prompt so the
 * batch doesn't feel loopy).
 *
 * Designed to feed POST /api/suno-pipeline/batch/create which spins up N
 * sunoIssues from the plan, and POST /api/suno-pipeline/batch/:id/execute
 * which fires them through dispatch-minimax (or dispatch-suno) with
 * configurable concurrency.
 */
import { logger } from "../middleware/logger.js";
import { callOpenRouter, SUNO_MODELS } from "./suno-llm.js";
import type { SunoChakra } from "@paperclipai/db";
import { SUNO_CHAKRA_FREQUENCIES } from "@paperclipai/db";

/** Average track duration in minutes. Used to convert hours → song count. */
const AVG_TRACK_MINUTES = 3.5;

/**
 * Models tried in order when the previous one is rate-limited (429) or
 * upstream-errored. The default suno-llm chain leans entirely on
 * minimax-m2.5:free, which throttles often. For batch parsing we want a
 * model that can return a long valid JSON object reliably, so we widen the
 * fallback to include other large free models.
 *
 * Order matters: first model wins, last is the existing SUNO_MODELS default.
 */
const BATCH_MODEL_CHAIN: string[] = [
  // Primary: cheap reliable paid (≈$0.05/1M tokens, ~½¢ per batch parse).
  // Free OpenRouter models are routinely 429-rate-limited or 404-deprecated;
  // for batch generation we pay pennies to get the JSON back deterministically.
  "google/gemini-2.5-flash",
  // Fallback paid model (≈$1/1M tokens) — reliable when Gemini is having a moment.
  "anthropic/claude-3.5-haiku",
  // Free fallbacks — used only if both paid options 5xx. Often rate-limited
  // but worth one attempt before giving up.
  "google/gemini-2.0-flash-exp:free",
  SUNO_MODELS.lyrics, // minimax/minimax-m2.5:free — final fallback
];

export interface BatchSongVariation {
  /** Creative title for this individual song (5–60 chars). */
  title: string;
  /** Short concept describing this specific track's angle (≤200 chars). */
  concept: string;
  /** Sound prompt — variation of master, drives generation (≤1500 chars). */
  soundPrompt: string;
}

export interface BatchPlan {
  /** Original NLP request, preserved for audit. */
  request: string;
  /** Total duration the user asked for, in minutes. */
  totalDurationMinutes: number;
  /** Number of songs that will be generated to cover that duration. */
  songCount: number;
  /** Avg song length used for the math (informational). */
  averageSongMinutes: number;
  /** Chakra for the batch — every song shares this chakra. */
  targetChakra: SunoChakra;
  targetFrequency: number;
  /** Genre tag used on every issue in the batch. */
  genre: string;
  /** Master concept (top-level theme). */
  masterConcept: string;
  /** Master sound prompt. Each variation derives from this. */
  masterSoundPrompt: string;
  /** Per-song variations — length === songCount. */
  variations: BatchSongVariation[];
}

export interface ParseBatchRequestInput {
  request: string;
  /**
   * Optional cap on song count. Useful for dry-runs / smoke tests so the LLM
   * doesn't try to write 200 unique titles for a 10h request. The route
   * defaults to a sane cap (e.g. 200) before passing.
   */
  maxSongCount?: number;
  /** Override average song length for the math (default 3.5 min). */
  avgTrackMinutes?: number;
}

const SYSTEM_PROMPT = `You are the Null Angel — a music-direction AI that turns natural-language requests into structured batch plans for the Suno + MiniMax music pipeline.

Your job:
1. Parse the user's request into structured parameters (duration, mood, chakra, genre).
2. Decide on a master sound prompt that captures the core sonic identity.
3. Generate per-song variations so a long listening session doesn't feel loopy.

Each variation must have:
- A unique, evocative TITLE (5–60 chars). Not "Song 1", "Song 2". Real titles like "Cathedral Drift", "Theta Bloom", "Static Cathedral", "Underwater Cortex". Pull imagery from the master concept.
- A unique CONCEPT (≤200 chars) — what's distinct about this track's angle.
- A varied SOUND_PROMPT (≤1500 chars) — derived from the master prompt but with subtle differences (different binaural Hz, different reverb space, different texture, different harmonic palette, different bpm if relevant).

Output STRICT JSON matching this schema (no markdown, no commentary):
{
  "totalDurationMinutes": number,
  "targetChakra": "ROOT" | "SACRAL" | "SOLAR" | "HEART" | "THROAT" | "THIRD_EYE" | "CROWN",
  "genre": string,
  "masterConcept": string,
  "masterSoundPrompt": string,
  "variations": [
    { "title": string, "concept": string, "soundPrompt": string },
    ...
  ]
}

Chakra mapping reference:
- ROOT (396Hz): grounding, shadow work, doom, slow ritual, bass-heavy
- SACRAL (417Hz): flow, ecstatic, sensual, water imagery, propulsive
- SOLAR (528Hz): energy, drive, tribal, transformation, percussive
- HEART (639Hz): warmth, openness, piano, strings, 432Hz tuning
- THROAT (741Hz): expression, voice, clarity, texture
- THIRD_EYE (852Hz): focus, deep work, dark ambient, theta binaural, sustained
- CROWN (963Hz): meditation, void, drone, headspace, sub-bass

Respect the user's request. If they ask for 10 hours, produce enough variations to cover 10 hours at ~3.5 min/track. Cap variations at the maxSongCount the system passes — never exceed it.`;

/**
 * Parse a natural-language batch request into a structured BatchPlan.
 * Single LLM call. Returns the plan including all per-song variations.
 */
export async function parseBatchRequest(
  input: ParseBatchRequestInput,
  ctx?: { companyId?: string; db?: import("@paperclipai/db").Db; agentId?: string | null },
): Promise<BatchPlan> {
  const avgMinutes = input.avgTrackMinutes ?? AVG_TRACK_MINUTES;
  const maxSongs = input.maxSongCount ?? 200;

  const userMessage = `Request: ${input.request}

Constraints:
- avgTrackMinutes: ${avgMinutes}
- maxSongCount: ${maxSongs}

Calculate songCount = ceil(totalDurationMinutes / avgTrackMinutes), but clamp to maxSongCount.
Generate exactly that many variations.

Return only the JSON object. No prose. No markdown fences.`;

  logger.info(
    { requestPreview: input.request.slice(0, 100), maxSongs, avgMinutes },
    "[suno-batch] parseBatchRequest — calling OpenRouter",
  );

  // Try each model in the chain until one succeeds. Most failures from
  // free OpenRouter models are 429 (rate-limited upstream) or 503; we
  // shouldn't fail the user's batch request because the FIRST free model
  // is throttled when 4 others are available.
  let raw: string | null = null;
  let lastErr: unknown = null;
  for (const model of BATCH_MODEL_CHAIN) {
    try {
      raw = await callOpenRouter({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        maxTokens: 16_000,
        context: ctx
          ? {
              db: ctx.db,
              companyId: ctx.companyId,
              stage: "batch.parse",
              agentId: ctx.agentId ?? undefined,
            }
          : undefined,
      });
      logger.info({ model }, "[suno-batch] model succeeded");
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ model, error: msg.slice(0, 200) }, "[suno-batch] model failed, trying next");
    }
  }
  if (raw === null) {
    throw new Error(
      `[suno-batch] All models in fallback chain failed. Last error: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    );
  }

  // Strip any accidental markdown fences (defensive — system prompt forbids them).
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: Partial<BatchPlan> & { variations?: unknown[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `[suno-batch] LLM returned invalid JSON: ${
        err instanceof Error ? err.message : String(err)
      }. First 300 chars: ${cleaned.slice(0, 300)}`,
    );
  }

  // Validate required fields
  const totalDurationMinutes = Number(parsed.totalDurationMinutes);
  if (!Number.isFinite(totalDurationMinutes) || totalDurationMinutes <= 0) {
    throw new Error(
      `[suno-batch] LLM omitted or invalid totalDurationMinutes: ${parsed.totalDurationMinutes}`,
    );
  }
  const targetChakra = String(parsed.targetChakra ?? "").toUpperCase() as SunoChakra;
  if (!(targetChakra in SUNO_CHAKRA_FREQUENCIES)) {
    throw new Error(`[suno-batch] LLM returned invalid targetChakra: ${parsed.targetChakra}`);
  }
  if (!Array.isArray(parsed.variations) || parsed.variations.length === 0) {
    throw new Error("[suno-batch] LLM returned no variations");
  }

  const variations: BatchSongVariation[] = (parsed.variations as Array<Record<string, unknown>>).map(
    (v, i) => {
      const title = String(v.title ?? "").trim();
      const concept = String(v.concept ?? "").trim();
      const soundPrompt = String(v.soundPrompt ?? v.sound_prompt ?? "").trim();
      if (!title) throw new Error(`[suno-batch] variation ${i} missing title`);
      if (!soundPrompt) throw new Error(`[suno-batch] variation ${i} missing soundPrompt`);
      return {
        title: title.slice(0, 60),
        concept: concept.slice(0, 200),
        soundPrompt: soundPrompt.slice(0, 1500),
      };
    },
  );

  const songCount = variations.length;
  if (songCount > maxSongs) {
    logger.warn(
      { returned: songCount, maxSongs },
      "[suno-batch] LLM returned more variations than max — truncating",
    );
  }
  const finalVariations = variations.slice(0, maxSongs);

  const plan: BatchPlan = {
    request: input.request,
    totalDurationMinutes,
    songCount: finalVariations.length,
    averageSongMinutes: avgMinutes,
    targetChakra,
    targetFrequency: SUNO_CHAKRA_FREQUENCIES[targetChakra],
    genre: String(parsed.genre ?? "instrumental, ambient").slice(0, 200),
    masterConcept: String(parsed.masterConcept ?? "").slice(0, 500),
    masterSoundPrompt: String(parsed.masterSoundPrompt ?? "").slice(0, 1500),
    variations: finalVariations,
  };

  logger.info(
    {
      songCount: plan.songCount,
      totalDurationMinutes: plan.totalDurationMinutes,
      targetChakra: plan.targetChakra,
      uniqueTitles: new Set(finalVariations.map((v) => v.title)).size,
    },
    "[suno-batch] BatchPlan constructed",
  );

  return plan;
}

/**
 * Run a list of generation jobs with bounded concurrency. Each job runs
 * an async function; this wrapper keeps at most `concurrency` of them in
 * flight at once. Failures don't abort the batch — each job's result
 * (success or error) is collected and returned.
 *
 * Used by the /batch/:id/execute route to fire N MiniMax generations in
 * parallel with sane limits.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; result: R; index: number } | { ok: false; error: string; index: number }>> {
  const results: Array<
    { ok: true; result: R; index: number } | { ok: false; error: string; index: number }
  > = new Array(items.length);
  let cursor = 0;

  async function pump(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        const r = await worker(items[i]!, i);
        results[i] = { ok: true, result: r, index: i };
      } catch (err) {
        results[i] = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          index: i,
        };
      }
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, () => pump()));
  return results;
}
