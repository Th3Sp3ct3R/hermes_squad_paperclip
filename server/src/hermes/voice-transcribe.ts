/**
 * Whisper transcription — Hermes' ears.
 *
 * Takes raw audio (WAV/webm as base64 or Buffer) and returns transcribed text
 * via OpenAI's Whisper API.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration_ms: number;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("[voice-transcribe] OPENAI_API_KEY is required in .env");
  }

  const ext = mimeType.includes("wav") ? "wav" : "webm";
  const startMs = performance.now();

  // Build multipart form data manually (Node 18+ fetch with FormData)
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, `speech.${ext}`);
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");

  const res = await fetch(WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `[voice-transcribe] Whisper failed (${res.status}): ${errorText.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as { text: string; language?: string };
  const durationMs = Math.round(performance.now() - startMs);

  // Log for cost tracking (~$0.006 per minute of audio)
  const logDir = resolve(process.cwd(), "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(
    resolve(logDir, "dispatch.jsonl"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      tier: "standard",
      model_used: "openai/whisper-1",
      cost_actual: 0.006, // rough estimate per call (few seconds of audio)
      latency_ms: durationMs,
      agent_name: "hermes:ears",
      tokens_input: audioBuffer.length,
      tokens_output: data.text.length,
    }) + "\n",
    "utf-8"
  );

  return {
    text: data.text,
    language: data.language,
    duration_ms: durationMs,
  };
}
