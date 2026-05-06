/**
 * Hermes Voice Audition — preview MiniMax system voices for Hermes.
 *
 * Usage:
 *   npx tsx server/src/hermes/voice-audition.ts
 *
 * Generates the same Hermes test text through 6 candidate voices,
 * saves MP3s to audio/voice-audition/, and prints a selection table.
 *
 * Requires MINIMAX_API_KEY in .env
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Test text — something Hermes would actually say
// ─────────────────────────────────────────────────────────────

const PREVIEW_TEXT = `The seed lattice is set. Metatron laid the harmonic skeleton at three hundred and ninety-six hertz — root chakra, grounding frequency. Uriel shaped the sound prompt: dark minimal, sub-bass dominant, no rhythm. Zadkiel marked it instrumental. Raphael will review. The pipeline moves.`;

// ─────────────────────────────────────────────────────────────
// Candidate voices
// ─────────────────────────────────────────────────────────────

interface VoiceCandidate {
  voice_id: string;
  label: string;
  hermes_variant: string;
  emotion: string;
  speed: number;
  pitch: number;
}

const CANDIDATES: VoiceCandidate[] = [
  {
    voice_id: "English_ManWithDeepVoice",
    label: "Man With Deep Voice",
    hermes_variant: "D: Void Frequency",
    emotion: "calm",
    speed: 0.95,
    pitch: -2,
  },
  {
    voice_id: "English_Deep-VoicedGentleman",
    label: "Deep-Voiced Gentleman",
    hermes_variant: "B: Ancient Sage",
    emotion: "calm",
    speed: 0.9,
    pitch: 0,
  },
  {
    voice_id: "English_magnetic_voiced_man",
    label: "Magnetic-Voiced Male",
    hermes_variant: "A: Silver Messenger",
    emotion: "calm",
    speed: 1.0,
    pitch: 0,
  },
  {
    voice_id: "English_WiseScholar",
    label: "Wise Scholar",
    hermes_variant: "B: Ancient Sage (alt)",
    emotion: "calm",
    speed: 0.9,
    pitch: -1,
  },
  {
    voice_id: "English_CaptivatingStoryteller",
    label: "Captivating Storyteller",
    hermes_variant: "C: Trickster-Youth",
    emotion: "happy",
    speed: 1.05,
    pitch: 0,
  },
  {
    voice_id: "English_expressive_narrator",
    label: "Expressive Narrator",
    hermes_variant: "All-rounder",
    emotion: "calm",
    speed: 1.0,
    pitch: 0,
  },
];

// ─────────────────────────────────────────────────────────────
// MiniMax TTS HTTP call
// ─────────────────────────────────────────────────────────────

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

interface T2AResponse {
  data: {
    audio: string; // hex-encoded audio
    status: number;
  };
  extra_info: {
    audio_length: number;
    audio_sample_rate: number;
    audio_size: number;
    usage_characters: number;
  };
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

async function generatePreview(candidate: VoiceCandidate): Promise<{
  audioBuffer: Buffer;
  durationMs: number;
  latencyMs: number;
}> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("[voice-audition] MINIMAX_API_KEY is required in .env");
  }

  const startMs = performance.now();

  const res = await fetch(`${MINIMAX_BASE}/v1/t2a_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "speech-2.8-hd",
      text: PREVIEW_TEXT,
      stream: false,
      output_format: "hex",
      voice_setting: {
        voice_id: candidate.voice_id,
        speed: candidate.speed,
        vol: 1.0,
        pitch: candidate.pitch,
        emotion: candidate.emotion,
      },
      audio_setting: {
        sample_rate: 44100,
        bitrate: 128000,
        format: "mp3",
        channel: 1,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(`TTS failed (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as T2AResponse;
  const latencyMs = Math.round(performance.now() - startMs);

  if (data.base_resp.status_code !== 0) {
    throw new Error(`TTS error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
  }

  const audioBuffer = Buffer.from(data.data.audio, "hex");

  return {
    audioBuffer,
    durationMs: data.extra_info.audio_length,
    latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  Hermes Voice Audition — MiniMax system voices\n");
  console.log(`  Model: speech-2.8-hd`);
  console.log(`  Text: "${PREVIEW_TEXT.slice(0, 60)}..."\n`);

  const outputDir = resolve(process.cwd(), "audio/voice-audition");
  mkdirSync(outputDir, { recursive: true });

  const results: Array<{
    label: string;
    voice_id: string;
    variant: string;
    file: string;
    duration_s: number;
    latency_ms: number;
  }> = [];

  for (const candidate of CANDIDATES) {
    process.stdout.write(`  [${candidate.voice_id}] Generating... `);

    try {
      const { audioBuffer, durationMs, latencyMs } = await generatePreview(candidate);
      const filename = `${candidate.voice_id}.mp3`;
      const filepath = resolve(outputDir, filename);
      writeFileSync(filepath, audioBuffer);

      const durationS = (durationMs / 1000).toFixed(1);
      console.log(`${durationS}s (${latencyMs}ms latency) — saved`);

      results.push({
        label: candidate.label,
        voice_id: candidate.voice_id,
        variant: candidate.hermes_variant,
        file: `audio/voice-audition/${filename}`,
        duration_s: durationMs / 1000,
        latency_ms: latencyMs,
      });
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // Save manifest
  const manifestPath = resolve(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(results, null, 2));

  // Print results table
  console.log("\n  ┌───────────────────────────────────────────────────────────────────┐");
  console.log("  │  VOICE AUDITION RESULTS                                          │");
  console.log("  ├───────────────────────────────────────────────────────────────────┤");

  for (const r of results) {
    const padLabel = r.label.padEnd(26);
    const padVariant = r.variant.padEnd(24);
    console.log(`  │  ${padLabel} ${padVariant} ${r.duration_s.toFixed(1)}s  │`);
    console.log(`  │    ${r.file.padEnd(61)}│`);
  }

  console.log("  ├───────────────────────────────────────────────────────────────────┤");
  console.log("  │  Listen to the files, then set MINIMAX_VOICE_ID in .env:          │");
  console.log("  │                                                                   │");
  console.log("  │    MINIMAX_VOICE_ID=English_ManWithDeepVoice                      │");
  console.log("  │                                                                   │");
  console.log("  │  Or use any voice_id from the list above.                         │");
  console.log("  └───────────────────────────────────────────────────────────────────┘\n");
}

main().catch((err) => {
  console.error("[voice-audition] Fatal:", err);
  process.exit(1);
});
