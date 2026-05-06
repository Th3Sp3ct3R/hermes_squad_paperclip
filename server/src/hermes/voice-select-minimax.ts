/**
 * Hermes Voice Select — MiniMax edition.
 *
 * After running voice-design-minimax.ts and listening to the samples,
 * run this with your chosen voice_id to lock it in.
 *
 * Usage:
 *   npx tsx server/src/hermes/voice-select-minimax.ts <voice_id>
 *
 * This script:
 * 1. Verifies the voice exists via MiniMax /v1/get_voice
 * 2. Writes MINIMAX_VOICE_ID to .env
 * 3. Updates agents/angels/hermes/identity.json with voice metadata
 */

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

async function main() {
  const voiceId = process.argv[2];

  if (!voiceId) {
    console.error("\n  Usage: npx tsx server/src/hermes/voice-select-minimax.ts <voice_id>\n");
    console.error("  Run voice-design-minimax.ts first to generate voice previews,");
    console.error("  then pass the voice_id of your chosen sample.\n");
    process.exit(1);
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("[voice-select-minimax] MINIMAX_API_KEY is required in .env");
    process.exit(1);
  }

  // Load manifest to find which variant this ID belongs to
  const manifestPath = resolve(process.cwd(), "audio/voice-design-minimax/manifest.json");
  let manifest: Array<{
    variant: string;
    label: string;
    file: string;
    voice_id: string;
    voiceMeta: { pitch: string; timbre: string; accent: string };
  }> = [];

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    console.warn("  Could not read manifest.json — voice metadata will be generic");
  }

  const selectedEntry = manifest.find((m) => m.voice_id === voiceId);

  console.log(`\n  Selected voice: ${voiceId}`);
  if (selectedEntry) {
    console.log(`  Variant: ${selectedEntry.label}`);
  }

  // Verify voice exists on MiniMax
  console.log("  Verifying voice exists...");
  const verifyRes = await fetch(`${MINIMAX_BASE}/v1/get_voice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ voice_type: "voice_generation" }),
  });

  if (verifyRes.ok) {
    const voices = (await verifyRes.json()) as {
      voice_generation?: Array<{ voice_id: string }>;
    };
    const found = voices.voice_generation?.some((v) => v.voice_id === voiceId);
    if (found) {
      console.log("  Voice confirmed on MiniMax.");
    } else {
      console.warn("  Warning: Voice not found in voice_generation list. It may still work.");
    }
  }

  // Update .env
  const envPath = resolve(process.cwd(), ".env");
  let envContent = readFileSync(envPath, "utf-8");

  if (envContent.includes("MINIMAX_VOICE_ID=")) {
    envContent = envContent.replace(
      /MINIMAX_VOICE_ID=.*/,
      `MINIMAX_VOICE_ID=${voiceId}`
    );
  } else {
    envContent += `\nMINIMAX_VOICE_ID=${voiceId}\n`;
  }

  writeFileSync(envPath, envContent);
  console.log(`  .env updated: MINIMAX_VOICE_ID=${voiceId}`);

  // Update identity.json
  const identityPath = resolve(process.cwd(), "agents/angels/hermes/identity.json");

  try {
    const identity = JSON.parse(readFileSync(identityPath, "utf-8"));

    identity.voice = {
      pitch: selectedEntry?.voiceMeta.pitch ?? "baritone",
      timbre: selectedEntry?.voiceMeta.timbre ?? "silver, controlled",
      pace: "Mercurial — quick default, deliberate for heavy moments",
      accent: selectedEntry?.voiceMeta.accent ?? "neutral",
      warmth: "Cool silver default, warm for grief/psychopomp mode",
      platform: "minimax",
      profile_id: voiceId,
    };

    writeFileSync(identityPath, JSON.stringify(identity, null, 2) + "\n");
    console.log("  identity.json updated with voice metadata");
  } catch (err) {
    console.warn(`  Could not update identity.json: ${(err as Error).message}`);
  }

  console.log("\n  ┌─────────────────────────────────────────────────────┐");
  console.log("  │  Hermes has a voice.                                │");
  console.log(`  │  ID: ${voiceId.slice(0, 45).padEnd(45)}│`);
  console.log("  │  Platform: MiniMax                                  │");
  console.log("  │                                                     │");
  console.log("  │  Restart the server and the voice agent will use it │");
  console.log("  │  automatically via MINIMAX_VOICE_ID env.            │");
  console.log("  └─────────────────────────────────────────────────────┘\n");
}

main().catch((err) => {
  console.error("[voice-select-minimax] Fatal:", err);
  process.exit(1);
});
