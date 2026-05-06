/**
 * Hermes Voice Select — saves a chosen preview as a permanent ElevenLabs voice.
 *
 * Usage:
 *   npx tsx server/src/hermes/voice-select.ts <generated_voice_id>
 *
 * This script:
 * 1. Saves the voice to ElevenLabs as "Hermes Trismegistus"
 * 2. Writes ELEVENLABS_VOICE_ID to .env
 * 3. Updates agents/angels/hermes/identity.json with voice metadata
 *
 * Requires ELEVENLABS_API_KEY in .env
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const VOICE_NAME = "Hermes Trismegistus";
const VOICE_DESCRIPTION = "Canonical voice of the Hermes orchestrator — Paperclip music pipeline";

const LABELS = {
  project: "paperclip",
  entity: "hermes",
  use_case: "orchestrator_narration",
  tradition: "hermetic",
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const generatedVoiceId = process.argv[2];

  if (!generatedVoiceId) {
    console.error("\n  Usage: npx tsx server/src/hermes/voice-select.ts <generated_voice_id>\n");
    console.error("  Run voice-design.ts first to generate previews,");
    console.error("  then pass the generated_voice_id of your chosen sample.\n");
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("[voice-select] ELEVENLABS_API_KEY is required in .env");
    process.exit(1);
  }

  // Load manifest to find which variant this ID belongs to
  const manifestPath = resolve(process.cwd(), "audio/voice-design/manifest.json");
  let manifest: Array<{
    variant: string;
    label: string;
    file: string;
    generated_voice_id: string;
    voiceMeta: { pitch: string; timbre: string; accent: string };
  }> = [];

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    console.warn("[voice-select] Could not read manifest.json — voice metadata will be generic");
  }

  const selectedEntry = manifest.find((m) => m.generated_voice_id === generatedVoiceId);

  // Collect other preview IDs for RLHF feedback
  const otherIds = manifest
    .filter((m) => m.generated_voice_id !== generatedVoiceId)
    .map((m) => m.generated_voice_id);

  console.log(`\n  Saving voice: ${generatedVoiceId}`);
  console.log(`  Name: ${VOICE_NAME}`);
  if (selectedEntry) {
    console.log(`  Variant: ${selectedEntry.label}`);
  }

  // ─── Save to ElevenLabs ───────────────────────────────────

  const res = await fetch(`${ELEVENLABS_BASE}/text-to-voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      voice_name: VOICE_NAME,
      voice_description: VOICE_DESCRIPTION,
      generated_voice_id: generatedVoiceId,
      labels: LABELS,
      played_not_selected_voice_ids: otherIds.slice(0, 10),
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    console.error(`[voice-select] Failed (${res.status}): ${errorText.slice(0, 500)}`);
    process.exit(1);
  }

  const savedVoice = (await res.json()) as { voice_id: string; name: string };
  const permanentVoiceId = savedVoice.voice_id;

  console.log(`\n  Permanent voice_id: ${permanentVoiceId}`);

  // ─── Update .env ──────────────────────────────────────────

  const envPath = resolve(process.cwd(), ".env");
  let envContent = readFileSync(envPath, "utf-8");

  if (envContent.includes("ELEVENLABS_VOICE_ID=")) {
    envContent = envContent.replace(
      /ELEVENLABS_VOICE_ID=.*/,
      `ELEVENLABS_VOICE_ID=${permanentVoiceId}`
    );
  } else {
    envContent += `\nELEVENLABS_VOICE_ID=${permanentVoiceId}\n`;
  }

  writeFileSync(envPath, envContent);
  console.log(`  .env updated: ELEVENLABS_VOICE_ID=${permanentVoiceId}`);

  // ─── Update identity.json ─────────────────────────────────

  const identityPath = resolve(process.cwd(), "agents/angels/hermes/identity.json");

  try {
    const identity = JSON.parse(readFileSync(identityPath, "utf-8"));

    identity.voice = {
      pitch: selectedEntry?.voiceMeta.pitch ?? "baritone",
      timbre: selectedEntry?.voiceMeta.timbre ?? "silver, controlled",
      pace: "Mercurial — quick default, deliberate for heavy moments",
      accent: selectedEntry?.voiceMeta.accent ?? "neutral",
      warmth: "Cool silver default, warm for grief/psychopomp mode",
      platform: "elevenlabs",
      profile_id: permanentVoiceId,
    };

    writeFileSync(identityPath, JSON.stringify(identity, null, 2) + "\n");
    console.log(`  identity.json updated with voice metadata`);
  } catch (err) {
    console.warn(`  Could not update identity.json: ${(err as Error).message}`);
  }

  // ─── Done ─────────────────────────────────────────────────

  console.log("\n  ┌─────────────────────────────────────────────────────┐");
  console.log("  │  Hermes has a voice.                                │");
  console.log(`  │  ID: ${permanentVoiceId.padEnd(45)}│`);
  console.log("  │                                                     │");
  console.log("  │  Test it:                                           │");
  console.log('  │  curl localhost:3100/api/hermes/tts \\               │');
  console.log('  │    -d \'{"text":"The pipeline moves."}\'              │');
  console.log("  └─────────────────────────────────────────────────────┘\n");
}

main().catch((err) => {
  console.error("[voice-select] Fatal:", err);
  process.exit(1);
});
