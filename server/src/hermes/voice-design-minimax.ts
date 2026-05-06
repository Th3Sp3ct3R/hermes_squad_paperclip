/**
 * Hermes Voice Design — MiniMax edition.
 *
 * Generates 4 custom voice variants via MiniMax /v1/voice_design,
 * each shaped by a text prompt describing Hermes' character.
 * Saves trial audio + voice_ids for selection.
 *
 * Usage:
 *   npx tsx server/src/hermes/voice-design-minimax.ts
 *
 * Requires MINIMAX_API_KEY in .env
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Preview text — what Hermes would actually say during a run
// ─────────────────────────────────────────────────────────────

const PREVIEW_TEXT = `The seed lattice is set. Metatron laid the harmonic skeleton at three hundred and ninety-six hertz — root chakra, grounding frequency. Uriel shaped the sound prompt: dark minimal, sub-bass dominant, no rhythm. Zadkiel marked it instrumental. Raphael will review. The pipeline moves.`;

// ─────────────────────────────────────────────────────────────
// Four Hermes voice variants
// ─────────────────────────────────────────────────────────────

interface VoiceVariant {
  id: string;
  label: string;
  prompt: string;
  voiceMeta: {
    pitch: string;
    timbre: string;
    accent: string;
  };
}

const VARIANTS: VoiceVariant[] = [
  {
    id: "a-silver-messenger",
    label: "A: Silver-Tongued Messenger",
    prompt: `A clear, quicksilver male baritone in his early thirties with bright articulation and a faint metallic resonance in the upper register. Speaks with the brisk precision of a working musician briefing his band — no wasted words, subtle wit in the pacing. Slightly British-inflected mid-Atlantic delivery, never posh. Cool but not cold. The voice of someone who knows the answer before you finish asking.`,
    voiceMeta: {
      pitch: "mid baritone",
      timbre: "metallic silver, bright articulation",
      accent: "mid-Atlantic, slight British inflection",
    },
  },
  {
    id: "b-ancient-sage",
    label: "B: Ancient Sage",
    prompt: `A deep, resonant male bass-baritone in his late forties with the unhurried cadence of someone who has explained the universe before and will again. Warm low frequencies, measured pauses between clauses, each word placed with intention. Slight reverberant quality as though speaking in a stone library. Not dramatic — genuinely calm. The voice of accumulated knowledge delivered without ego.`,
    voiceMeta: {
      pitch: "low bass-baritone",
      timbre: "warm stone, reverberant depth",
      accent: "neutral English, unhurried",
    },
  },
  {
    id: "c-trickster-youth",
    label: "C: Trickster-Youth",
    prompt: `A light, agile male tenor in his mid twenties with quick pacing and bright energy. Speaks like someone who just solved a puzzle and is delighted about it — not smug, genuinely amused. Slight upward inflections on key words, rhythmic delivery that borders on musical. Neutral American accent with faint cosmopolitan undertones. The voice of invention and play.`,
    voiceMeta: {
      pitch: "light tenor",
      timbre: "agile, bright, rhythmic",
      accent: "neutral American, cosmopolitan",
    },
  },
  {
    id: "d-void-frequency",
    label: "D: Void Frequency",
    prompt: `A low, dark male baritone in his mid thirties with minimal inflection and controlled breath. Speaks as though narrating from inside a server room at three in the morning — quiet, precise, no emotion wasted. Each sentence lands flat and deliberate. Slight mechanical quality without being robotic. Warmth exists but is buried deep, surfacing only on final syllables. The voice of architecture and absence.`,
    voiceMeta: {
      pitch: "low dark baritone",
      timbre: "controlled, minimal, mechanical warmth",
      accent: "neutral, flat affect",
    },
  },
];

// ─────────────────────────────────────────────────────────────
// MiniMax Voice Design API
// ─────────────────────────────────────────────────────────────

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

interface VoiceDesignResponse {
  voice_id: string;
  trial_audio: string; // hex-encoded audio
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}

async function designVoice(variant: VoiceVariant): Promise<VoiceDesignResponse> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("[voice-design-minimax] MINIMAX_API_KEY is required in .env");
  }

  const res = await fetch(`${MINIMAX_BASE}/v1/voice_design`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: variant.prompt,
      preview_text: PREVIEW_TEXT,
      voice_id: `hermes-${variant.id}-${Date.now()}`,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(`Voice design failed (${res.status}): ${errorText.slice(0, 500)}`);
  }

  const data = (await res.json()) as VoiceDesignResponse;

  if (data.base_resp.status_code !== 0) {
    throw new Error(
      `Voice design error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`
    );
  }

  return data;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  Hermes Voice Design — MiniMax custom voices\n");
  console.log(`  Preview text: "${PREVIEW_TEXT.slice(0, 60)}..."\n`);

  const outputDir = resolve(process.cwd(), "audio/voice-design-minimax");
  mkdirSync(outputDir, { recursive: true });

  const manifest: Array<{
    variant: string;
    label: string;
    file: string;
    voice_id: string;
    voiceMeta: VoiceVariant["voiceMeta"];
  }> = [];

  for (const variant of VARIANTS) {
    process.stdout.write(`  [${variant.id}] Designing... `);

    try {
      const startMs = performance.now();
      const result = await designVoice(variant);
      const latencyMs = Math.round(performance.now() - startMs);

      // Decode hex audio → MP3 file
      const audioBuffer = Buffer.from(result.trial_audio, "hex");
      const filename = `${variant.id}.mp3`;
      const filepath = resolve(outputDir, filename);
      writeFileSync(filepath, audioBuffer);

      const sizeKb = (audioBuffer.length / 1024).toFixed(0);
      console.log(`${sizeKb}KB (${latencyMs}ms) → ${result.voice_id}`);

      manifest.push({
        variant: variant.id,
        label: variant.label,
        file: `audio/voice-design-minimax/${filename}`,
        voice_id: result.voice_id,
        voiceMeta: variant.voiceMeta,
      });
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }
  }

  // Save manifest
  const manifestPath = resolve(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Print results
  console.log("\n  ┌───────────────────────────────────────────────────────────────────────┐");
  console.log("  │  HERMES VOICE DESIGN — MINIMAX RESULTS                               │");
  console.log("  ├───────────────────────────────────────────────────────────────────────┤");

  for (const m of manifest) {
    console.log(`  │  ${m.label.padEnd(30)} ${m.voice_id.slice(0, 32).padEnd(34)} │`);
    console.log(`  │    ${m.file.padEnd(63)} │`);
  }

  console.log("  ├───────────────────────────────────────────────────────────────────────┤");
  console.log("  │  Listen to the files, then pick a voice_id.                           │");
  console.log("  │                                                                       │");
  console.log("  │  Set in .env:                                                         │");
  console.log("  │    MINIMAX_VOICE_ID=<your chosen voice_id>                            │");
  console.log("  │                                                                       │");
  console.log("  │  Or run the selection script:                                         │");
  console.log("  │    npx tsx server/src/hermes/voice-select-minimax.ts <voice_id>       │");
  console.log("  └───────────────────────────────────────────────────────────────────────┘\n");
}

main().catch((err) => {
  console.error("[voice-design-minimax] Fatal:", err);
  process.exit(1);
});
