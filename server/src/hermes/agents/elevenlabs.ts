/**
 * ElevenLabs TTS — Hermes' canonical voice.
 *
 * The orchestrator made audible. Used for pipeline narration, spoken-word
 * intros, sample tags, status announcements, and any text-to-speech output
 * from the Paperclip system.
 *
 * Uses the ElevenLabs v1 API directly (not via OpenRouter — ElevenLabs
 * isn't yet available there). Requires ELEVENLABS_API_KEY env.
 *
 * Default voice: ELEVENLABS_VOICE_ID (Hermes Trismegistus).
 * Default model: eleven_multilingual_v2 (best quality).
 */

import { z } from "zod";
import { tool } from "@openrouter/agent/tool";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { appendFileSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

/** ElevenLabs model tiers — higher quality = slower + more expensive */
const ELEVENLABS_MODELS = {
  turbo: "eleven_turbo_v2_5",
  standard: "eleven_multilingual_v2",
  flash: "eleven_flash_v2_5",
} as const;

// ─────────────────────────────────────────────────────────────
// Hermes voice presets — mood-specific tuning
// ─────────────────────────────────────────────────────────────

export const HERMES_VOICE_PRESETS = {
  /** Default orchestrator narration — silver, measured */
  narration: { stability: 0.65, similarity_boost: 0.80, style: 0.15 },
  /** Pipeline status updates — brisk, efficient */
  status: { stability: 0.75, similarity_boost: 0.85, style: 0.05 },
  /** Psychopomp mode — warm, slow, grief-adjacent */
  psychopomp: { stability: 0.50, similarity_boost: 0.70, style: 0.40 },
  /** Trickster — playful, quicker */
  trickster: { stability: 0.40, similarity_boost: 0.75, style: 0.30 },
} as const;

export type HermesVoicePreset = keyof typeof HERMES_VOICE_PRESETS;

// ─────────────────────────────────────────────────────────────
// Input schema
// ─────────────────────────────────────────────────────────────

export const ElevenLabsInput = z.object({
  text: z.string().min(1).max(5000)
    .describe("Text to synthesize into speech"),
  voice_id: z.string().optional()
    .describe("ElevenLabs voice ID (defaults to ELEVENLABS_VOICE_ID env)"),
  model: z.enum(["turbo", "standard", "flash"]).default("standard")
    .describe("ElevenLabs model tier: turbo (fastest), standard (best quality), flash (balanced)"),
  preset: z.enum(["narration", "status", "psychopomp", "trickster"]).optional()
    .describe("Hermes voice preset — overrides stability/similarity_boost/style with tuned values"),
  stability: z.number().min(0).max(1).default(0.5)
    .describe("Voice stability — 0 = more variable/expressive, 1 = more consistent"),
  similarity_boost: z.number().min(0).max(1).default(0.75)
    .describe("How closely to match the original voice — higher = more faithful"),
  style: z.number().min(0).max(1).default(0.0)
    .describe("Style exaggeration — 0 = neutral, 1 = highly expressive (costs more latency)"),
  output_format: z.enum(["mp3_44100_128", "mp3_22050_32", "pcm_16000", "pcm_44100"]).default("mp3_44100_128")
    .describe("Audio output format"),
  /** Where to save the audio file (relative to cwd) */
  output_path: z.string().optional()
    .describe("File path to save audio (defaults to ./audio/<timestamp>.mp3)"),
});

// ─────────────────────────────────────────────────────────────
// Core TTS function
// ─────────────────────────────────────────────────────────────

export interface ElevenLabsResult {
  audio_path: string;
  voice_id: string;
  model_used: string;
  characters: number;
  latency_ms: number;
}

export async function synthesizeSpeech(
  params: z.infer<typeof ElevenLabsInput>
): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[elevenlabs] ELEVENLABS_API_KEY is required. Set it in env."
    );
  }

  const voiceId = params.voice_id ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) {
    throw new Error(
      "[elevenlabs] No voice_id provided and ELEVENLABS_VOICE_ID env is not set."
    );
  }

  // Apply preset if specified (overrides individual voice_settings)
  const presetSettings = params.preset
    ? HERMES_VOICE_PRESETS[params.preset]
    : null;

  const stability = presetSettings?.stability ?? params.stability;
  const similarityBoost = presetSettings?.similarity_boost ?? params.similarity_boost;
  const style = presetSettings?.style ?? params.style;

  const modelId = ELEVENLABS_MODELS[params.model];
  const startMs = performance.now();

  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: params.output_format.startsWith("mp3") ? "audio/mpeg" : "audio/wav",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: modelId,
        output_format: params.output_format,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `[elevenlabs] TTS failed (${res.status}): ${errorText.slice(0, 500)}`
    );
  }

  const latencyMs = Math.round(performance.now() - startMs);
  const audioBuffer = Buffer.from(await res.arrayBuffer());

  // Determine output path
  const ext = params.output_format.startsWith("mp3") ? "mp3" : "wav";
  const defaultPath = `audio/${Date.now()}.${ext}`;
  const outputPath = params.output_path ?? defaultPath;
  const fullPath = resolve(process.cwd(), outputPath);

  // Ensure directory exists and write
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, audioBuffer);

  // Log to dispatch.jsonl for cost tracking
  const logDir = resolve(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    resolve(logDir, "dispatch.jsonl"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      tier: "premium",
      model_used: `elevenlabs/${modelId}`,
      cost_actual: estimateElevenLabsCost(params.text.length, params.model),
      latency_ms: latencyMs,
      agent_name: "hermes:voice",
      tokens_input: params.text.length,
      tokens_output: audioBuffer.length,
      cost_cap_applied: 0.50,
    }) + "\n",
    "utf-8"
  );

  return {
    audio_path: outputPath,
    voice_id: voiceId,
    model_used: modelId,
    characters: params.text.length,
    latency_ms: latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Cost estimation (ElevenLabs charges per character)
// Pricing as of 2025: ~$0.30 per 1K chars on Creator plan
// ─────────────────────────────────────────────────────────────

function estimateElevenLabsCost(
  charCount: number,
  model: "turbo" | "standard" | "flash"
): number {
  // Approximate rates per 1K characters (varies by plan)
  const rates: Record<string, number> = {
    turbo: 0.15,
    standard: 0.30,
    flash: 0.08,
  };
  const rate = rates[model] ?? 0.30;
  return parseFloat(((charCount / 1000) * rate).toFixed(4));
}

// ─────────────────────────────────────────────────────────────
// Tool definition (for Hermes orchestrator)
// ─────────────────────────────────────────────────────────────

export const elevenLabsTool = tool({
  name: "elevenlabs_tts",
  description: "Synthesize text to speech using ElevenLabs — Hermes' canonical voice made audible. Used for pipeline narration, spoken-word intros, sample tags, voiceovers, status announcements, or any audio output from the system.",
  inputSchema: ElevenLabsInput as AnySchema,
  outputSchema: z.object({
    agent_name: z.string(),
    audio_path: z.string(),
    voice_id: z.string(),
    model_used: z.string(),
    characters: z.number(),
    latency_ms: z.number(),
  }) as AnySchema,
  execute: async (params) => {
    const result = await synthesizeSpeech(params);
    return {
      agent_name: "hermes:voice",
      ...result,
    };
  },
});
