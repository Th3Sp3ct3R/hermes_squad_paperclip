/**
 * MiniMax WebSocket TTS — Hermes' real-time voice for conversation.
 *
 * Uses the MiniMax WebSocket TTS endpoint (wss://api.minimax.io/ws/v1/t2a_v2)
 * for native streaming audio. No chunk rate-limiting needed — audio arrives
 * in real-time as it's synthesized.
 *
 * This is the conversational TTS provider (low latency, streaming).
 * ElevenLabs remains available for premium narration/releases via elevenlabs.ts.
 */

import WebSocket from "ws";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const MINIMAX_WS_URL = "wss://api.minimax.io/ws/v1/t2a_v2";

/** MiniMax speech models — turbo for conversation, hd for quality */
export const MINIMAX_TTS_MODELS = {
  turbo: "speech-2.8-turbo",
  hd: "speech-2.8-hd",
} as const;

export type MinimaxTTSModel = keyof typeof MINIMAX_TTS_MODELS;

// ─────────────────────────────────────────────────────────────
// Hermes voice presets mapped to MiniMax params
// ─────────────────────────────────────────────────────────────

export interface MinimaxVoiceSettings {
  emotion: string;
  speed: number;
  pitch: number;
  vol: number;
}

export const HERMES_MINIMAX_PRESETS = {
  narration: { emotion: "calm", speed: 1.0, pitch: 0, vol: 1.0 },
  status: { emotion: "fluent", speed: 1.2, pitch: 0, vol: 1.0 },
  psychopomp: { emotion: "sad", speed: 0.8, pitch: -2, vol: 0.9 },
  trickster: { emotion: "happy", speed: 1.1, pitch: 1, vol: 1.0 },
} as const;

export type HermesMinimaxPreset = keyof typeof HERMES_MINIMAX_PRESETS;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface MinimaxWsEvent {
  event: string;
  session_id?: string;
  trace_id?: string;
  data?: {
    audio?: string; // hex-encoded audio chunk
    status?: number;
  };
  extra_info?: {
    audio_length?: number;
    audio_sample_rate?: number;
    audio_size?: number;
    usage_characters?: number;
  };
  is_final?: boolean;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

export interface StreamTTSOptions {
  text: string;
  voiceId: string;
  preset: HermesMinimaxPreset;
  model?: MinimaxTTSModel;
  /** Called for each audio chunk (hex string → Buffer) */
  onAudioChunk: (chunk: Buffer, index: number) => void;
  /** Called when synthesis is complete */
  onDone: () => void;
  /** Called on error */
  onError: (err: Error) => void;
  /** AbortSignal for interrupt support */
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────
// Streaming TTS via WebSocket
// ─────────────────────────────────────────────────────────────

export function streamTTS(opts: StreamTTSOptions): void {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    opts.onError(new Error("[minimax-tts] MINIMAX_API_KEY is required in .env"));
    return;
  }

  const voiceSettings = HERMES_MINIMAX_PRESETS[opts.preset];
  const modelId = MINIMAX_TTS_MODELS[opts.model ?? "turbo"];
  const startMs = performance.now();
  let chunkIndex = 0;
  let totalAudioBytes = 0;
  let aborted = false;

  const ws = new WebSocket(MINIMAX_WS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  // Handle abort signal
  if (opts.signal) {
    const onAbort = () => {
      aborted = true;
      ws.close();
    };
    if (opts.signal.aborted) {
      opts.onError(new Error("Aborted"));
      return;
    }
    opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  ws.on("open", () => {
    // Step 1: Send task_start
    ws.send(JSON.stringify({
      event: "task_start",
      model: modelId,
      voice_setting: {
        voice_id: opts.voiceId,
        speed: voiceSettings.speed,
        vol: voiceSettings.vol,
        pitch: voiceSettings.pitch,
        emotion: voiceSettings.emotion,
      },
      audio_setting: {
        sample_rate: 44100,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    }));
  });

  ws.on("message", (raw: Buffer) => {
    if (aborted) return;

    let msg: MinimaxWsEvent;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.event) {
      case "task_started":
        // Server ready — send the text
        ws.send(JSON.stringify({
          event: "task_continue",
          text: opts.text,
        }));
        // Signal completion of text input
        ws.send(JSON.stringify({ event: "task_finish" }));
        break;

      case "task_continued":
        // Audio chunk received
        if (msg.data?.audio) {
          const audioBuffer = Buffer.from(msg.data.audio, "hex");
          totalAudioBytes += audioBuffer.length;
          opts.onAudioChunk(audioBuffer, chunkIndex++);
        }

        if (msg.is_final) {
          // All audio received
          const latencyMs = Math.round(performance.now() - startMs);
          logTTSCall(modelId, opts.text.length, totalAudioBytes, latencyMs, opts.voiceId);
          ws.close();
          opts.onDone();
        }
        break;

      case "task_failed":
        ws.close();
        opts.onError(new Error(
          `[minimax-tts] ${msg.base_resp?.status_code}: ${msg.base_resp?.status_msg ?? "unknown"}`
        ));
        break;

      case "task_finished":
        // Server confirms task complete
        break;

      case "connected_success":
        // Connection established, waiting for task_start response
        break;
    }
  });

  ws.on("error", (err) => {
    if (!aborted) {
      opts.onError(new Error(`[minimax-tts] WebSocket error: ${err.message}`));
    }
  });

  ws.on("close", () => {
    // Normal close after task_finished or abort
  });
}

// ─────────────────────────────────────────────────────────────
// Cost logging
// ─────────────────────────────────────────────────────────────

function logTTSCall(
  model: string,
  charCount: number,
  audioBytes: number,
  latencyMs: number,
  voiceId: string,
) {
  // MiniMax TTS pricing: ~$30/1M chars = $0.03/1K chars
  const costEstimate = parseFloat(((charCount / 1000) * 0.03).toFixed(4));

  const logDir = resolve(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    resolve(logDir, "dispatch.jsonl"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      tier: "standard",
      model_used: `minimax/${model}`,
      cost_actual: costEstimate,
      latency_ms: latencyMs,
      agent_name: "hermes:voice",
      tokens_input: charCount,
      tokens_output: audioBytes,
      voice_id: voiceId,
    }) + "\n",
    "utf-8",
  );
}
