/**
 * Hermes Voice Design — generates preview samples of 4 tonal variants.
 *
 * Usage:
 *   npx tsx server/src/hermes/voice-design.ts
 *
 * Requires ELEVENLABS_API_KEY in .env
 * Outputs 12 audio files (3 per variant) to audio/voice-design/
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Voice variant descriptions
// ─────────────────────────────────────────────────────────────

const PREVIEW_TEXT = `The seed lattice is set. Metatron laid the harmonic skeleton at three hundred and ninety-six hertz — root chakra, grounding frequency. Uriel shaped the sound prompt: dark minimal, sub-bass dominant, no rhythm. Zadkiel marked it instrumental. Raphael will review. The pipeline moves.`;

interface VoiceVariant {
  id: string;
  label: string;
  description: string;
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
    description: `Native English, Male, early 30s, Studio quality. A clear, quicksilver baritone with bright articulation and a faint metallic resonance in the upper register. Speaks with the brisk precision of a working musician briefing his band — no wasted words, subtle wit in the pacing. Slightly British-inflected mid-Atlantic delivery, never posh. Cool but not cold. The voice of someone who knows the answer before you finish asking.`,
    voiceMeta: {
      pitch: "mid baritone",
      timbre: "metallic silver, bright articulation",
      accent: "mid-Atlantic, slight British inflection",
    },
  },
  {
    id: "b-ancient-sage",
    label: "B: Ancient Sage",
    description: `Native English, Male, late 40s, Studio quality. A deep, resonant bass-baritone with the unhurried cadence of someone who has explained the universe before and will again. Warm low frequencies, measured pauses between clauses, each word placed with intention. Slight reverberant quality as though speaking in a stone library. Not dramatic — genuinely calm. The voice of accumulated knowledge delivered without ego.`,
    voiceMeta: {
      pitch: "low bass-baritone",
      timbre: "warm stone, reverberant depth",
      accent: "neutral English, unhurried",
    },
  },
  {
    id: "c-trickster-youth",
    label: "C: Trickster-Youth",
    description: `Native English, Male, mid 20s, Studio quality. A light, agile tenor with quick pacing and bright energy. Speaks like someone who just solved a puzzle and is delighted about it — not smug, genuinely amused. Slight upward inflections on key words, rhythmic delivery that borders on musical. Neutral American accent with faint cosmopolitan undertones. The voice of invention and play.`,
    voiceMeta: {
      pitch: "light tenor",
      timbre: "agile, bright, rhythmic",
      accent: "neutral American, cosmopolitan",
    },
  },
  {
    id: "d-void-frequency",
    label: "D: Void Frequency",
    description: `Native English, Male, mid 30s, Studio quality. A low, dark baritone with minimal inflection and controlled breath. Speaks as though narrating from inside a server room at 3am — quiet, precise, no emotion wasted. Each sentence lands flat and deliberate. Slight mechanical quality without being robotic. Warmth exists but is buried deep, surfacing only on final syllables. The voice of architecture and absence.`,
    voiceMeta: {
      pitch: "low dark baritone",
      timbre: "controlled, minimal, mechanical warmth",
      accent: "neutral, flat affect",
    },
  },
];

// ─────────────────────────────────────────────────────────────
// ElevenLabs Voice Design API
// ─────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

interface DesignPreview {
  audio_base_64: string;
  generated_voice_id: string;
  media_type: string;
  duration_secs: number;
}

interface DesignResponse {
  previews: DesignPreview[];
  text: string;
}

async function generatePreviews(variant: VoiceVariant): Promise<DesignResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("[voice-design] ELEVENLABS_API_KEY is required in .env");
  }

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-voice/design`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      voice_description: variant.description,
      text: PREVIEW_TEXT,
      auto_generate_text: false,
      model_id: "eleven_multilingual_ttv_v2",
      guidance_scale: 5,
      should_enhance: false,
      quality: 0.9,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `[voice-design] Failed for "${variant.id}" (${res.status}): ${errorText.slice(0, 500)}`
    );
  }

  return res.json() as Promise<DesignResponse>;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("\n  Hermes Voice Design — generating 4 variants x 3 previews\n");
  console.log("  Preview text:");
  console.log(`  "${PREVIEW_TEXT.slice(0, 80)}..."\n`);

  const outputDir = resolve(process.cwd(), "audio/voice-design");
  mkdirSync(outputDir, { recursive: true });

  const manifest: Array<{
    variant: string;
    label: string;
    file: string;
    generated_voice_id: string;
    duration_secs: number;
    voiceMeta: VoiceVariant["voiceMeta"];
  }> = [];

  for (const variant of VARIANTS) {
    console.log(`  [${variant.id}] Generating...`);

    try {
      const response = await generatePreviews(variant);

      for (let i = 0; i < response.previews.length; i++) {
        const preview = response.previews[i]!;
        const filename = `${variant.id}-${i + 1}.mp3`;
        const filepath = resolve(outputDir, filename);

        const audioBuffer = Buffer.from(preview.audio_base_64, "base64");
        writeFileSync(filepath, audioBuffer);

        manifest.push({
          variant: variant.id,
          label: variant.label,
          file: `audio/voice-design/${filename}`,
          generated_voice_id: preview.generated_voice_id,
          duration_secs: preview.duration_secs,
          voiceMeta: variant.voiceMeta,
        });

        console.log(
          `    [${i + 1}/3] ${filename} (${preview.duration_secs.toFixed(1)}s) → ${preview.generated_voice_id}`
        );
      }
    } catch (err) {
      console.error(`    ERROR: ${(err as Error).message}`);
    }

    console.log();
  }

  // Save manifest for the selection step
  const manifestPath = resolve(outputDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest saved: ${manifestPath}`);

  // Print selection table
  console.log("\n  ┌─────────────────────────────────────────────────────────────┐");
  console.log("  │  LISTEN TO SAMPLES, THEN RUN:                               │");
  console.log("  │                                                              │");
  console.log("  │  npx tsx server/src/hermes/voice-select.ts <voice_id>        │");
  console.log("  │                                                              │");
  console.log("  │  where <voice_id> is the generated_voice_id of your pick     │");
  console.log("  └─────────────────────────────────────────────────────────────┘\n");

  console.log("  Variant summary:");
  for (const item of manifest) {
    console.log(`    ${item.file}`);
    console.log(`      ID: ${item.generated_voice_id}`);
  }
}

main().catch((err) => {
  console.error("[voice-design] Fatal:", err);
  process.exit(1);
});
