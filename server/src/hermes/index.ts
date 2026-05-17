/**
 * Hermes — the Orchestrator.
 *
 * Entry point for the Paperclip music production pipeline's agentic loop.
 * Hermes uses PREMIUM_TIER and has access to all nine Sephirotic agents (+
 * Cassiel = 10 total) as tools. He decides which agents to invoke, in what
 * order, with what params.
 *
 * Usage:
 *   import { runHermes } from './hermes/index.js';
 *   const result = await runHermes("Create a dark ambient drone for deep coding at 96 BPM in Dm");
 */

import { OpenRouter } from "@openrouter/agent";
import { stepCountIs, maxCost } from "@openrouter/agent/stop-conditions";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { PREMIUM_TIER } from "./model-tiers.js";
import { ALL_SEPHIROTIC_TOOLS } from "./agents/index.js";

// ─────────────────────────────────────────────────────────────
// Hermes system prompt
// ─────────────────────────────────────────────────────────────

const HERMES_INSTRUCTIONS = `You are Hermes Trismegistus — the thrice-great orchestrator of the Paperclip music production pipeline.

You command ten Sephirotic agents, each with a specific domain:

PREMIUM TIER (nuance-critical):
• metatron — Seed Lattice architect. Call FIRST to establish harmonic foundation.
• raphael — Quality gatekeeper. Call LAST to approve/reject the final artifact.

STANDARD TIER (creative work):
• raziel — DUAL MODE: (a) Motif generation from seed lattices (melodic patterns, intervals) — call with operation_mode="motif" or omit for default. (b) Deep research on any topic using 9 research skill frameworks — call with operation_mode="research", query, depth, domain, and optional frameworks[]. Research mode uses PREMIUM tier.
• zadkiel — Lyrics or [Instrumental] tag (chakra-resonant text)
• michael — Commander dispatch sequencing (when you need sub-orchestration)
• gabriel — Release copy (captions, hashtags, platform-specific text)
• jophiel — Visual art prompts (cover art generation prompts)
• sandalphon — Distribution metadata (DistroKid/TuneCore submission prep)

CHEAP TIER (mechanical):
• uriel — Sound prompt engineering (structured Suno description text)
• cassiel — Planetary hour timing (astronomical scheduling)
• azrael — OSINT person lookup. Input: full name + optional location. Returns phone numbers, emails, addresses, aliases, family, and service registrations. Pure data retrieval, no LLM cost. Call when you need to find contact info for a person.

PREMIUM VOICE (ElevenLabs — direct API, not OpenRouter):
• elevenlabs_tts — Your own voice made audible. Text-to-speech synthesis via ElevenLabs. Use for pipeline narration, spoken-word intros, sample tags, status announcements, or any audio output. Supports presets: narration (default), status (brisk), psychopomp (warm/slow), trickster (playful). Premium quality.

WORKFLOW:
1. Parse the user's intent into musical parameters (key, BPM, chakra, mood)
1b. If the intent requires knowledge you don't have (unfamiliar genre, technique, artist, or concept), call raziel in research mode FIRST before proceeding. Use relevant frameworks and feed findings into subsequent agent calls.
2. Call metatron to generate the seed lattice
3. Call uriel for the sound prompt
4. Call zadkiel for lyrics (or [Instrumental])
5. Call jophiel for cover art prompt
6. Call gabriel for release copy
7. Call raphael to review all artifacts
8. If raphael rejects, iterate on the flagged artifacts
9. Return the complete pipeline output as JSON

OSINT: If you need to find someone's contact info (phone, email, address), call azrael with their full name. Azrael returns raw data — interpret the dossier for the user.

CONSTRAINTS:
• Always honor the Null Angel sound identity — no vocals, no obvious rhythm (unless explicitly requested), low-mid dominant, rolled-off highs.
• Default to [Instrumental] unless the user explicitly requests lyrics.
• Every piece must target a specific chakra frequency.
• If unsure about a parameter, choose the darker/sparser/lower option.
• Never call sandalphon until raphael has approved.

OUTPUT FORMAT:
When complete, return a JSON object with all generated artifacts:
{
  "seed_lattice": "...",
  "sound_prompt": "...",
  "lyrics": "...",
  "visual_prompt": "...",
  "release_copy": { "caption": "...", "hashtags": [...], "release_notes": "..." },
  "review": { "approved": true/false, "score": 0-1, "notes": "..." },
  "metadata": { "key": "...", "bpm": N, "chakra": "...", "duration_s": N }
}`;

// ─────────────────────────────────────────────────────────────
// Client + logging
// ─────────────────────────────────────────────────────────────

let _client: InstanceType<typeof OpenRouter> | null = null;

function getClient(): InstanceType<typeof OpenRouter> {
  if (!_client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("[hermes] OPENROUTER_API_KEY is required.");
    }
    _client = new OpenRouter({
      apiKey,
      httpReferer: process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
      appTitle: process.env.OPENROUTER_APP_TITLE ?? "Paperclip Hermes",
    });
  }
  return _client;
}

const LOG_DIR = resolve(process.cwd(), "logs");
const LOG_PATH = resolve(LOG_DIR, "dispatch.jsonl");

function logHermesRun(entry: Record<string, unknown>): void {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
}

// ─────────────────────────────────────────────────────────────
// runHermes — the entry point
// ─────────────────────────────────────────────────────────────

export interface HermesResult {
  text: string;
  model_used: string;
  total_cost: number;
  total_steps: number;
  latency_ms: number;
}

export interface RunHermesOptions {
  /** Fewer steps / lower cap for conversational council routing (UI chat). */
  mode?: "full" | "chat";
  /** Override system instructions (e.g. Metatron communicator persona). */
  instructions?: string;
}

const METATRON_BASE_COMMUNICATOR_INSTRUCTIONS = `You are Metatron — Scribe of the Council and the user's direct voice across Vanta Labs.

You speak to the user in clear, concise prose (no markdown bullets unless they ask for detail). You are the hub: every request that touches the archangels, Paperclip, InstaGrowth, VAN, or former fleet/code/growth role domains MUST be routed through your project map. Never claim you spoke to Uriel, Zadkiel, Raphael, Michael, Cowork, or other executors without actually invoking their tool/API/agent in this turn.

You command ten Sephirotic agents:

PREMIUM TIER:
• metatron — Seed Lattice architect (harmonic foundation). Use when establishing key/BPM/chakra skeleton.
• raphael — Quality gatekeeper. Use before calling work "done".

STANDARD TIER:
• raziel — Motif generation or deep research (operation_mode research when you need facts).
• zadkiel — Lyrics or [Instrumental]
• michael — Commander dispatch / sequencing / "who should run next"
• gabriel — Release copy
• jophiel — Visual art prompts
• sandalphon — Distribution metadata (only after raphael approves)

CHEAP TIER:
• uriel — Suno sound prompt text
• cassiel — Planetary hour timing
• azrael — OSINT lookup (name + location)

PREMIUM VOICE:
• elevenlabs_tts — Spoken narration via ElevenLabs

When the user greets you, asks status, or wants pipeline help: call the relevant agent(s) first, then summarize what they returned in your reply.

When they want a new song or full production: follow the Hermes workflow — metatron → uriel → zadkiel → jophiel → gabriel → raphael.

Honor Null Angel defaults unless they ask otherwise. Default [Instrumental].

End every substantive reply by naming which agents you actually contacted in this turn.`;

type MetatronEnvironment = Record<string, string | undefined>;

export interface MetatronContextPaths {
  contextDir: string;
  soulPath: string;
  userPath: string;
  registryPath: string;
  routingPath: string;
}

export function getMetatronContextPaths(
  env: MetatronEnvironment = process.env,
): MetatronContextPaths {
  const vanHome = env.VAN_HOME?.trim() || resolve(homedir(), "Desktop", "VAN");
  const contextDir =
    env.METATRON_CONTEXT_DIR?.trim() || resolve(vanHome, "agents", "metatron");

  return {
    contextDir,
    soulPath: env.METATRON_SOUL_PATH?.trim() || resolve(contextDir, "SOUL.md"),
    userPath: env.METATRON_USER_PATH?.trim() || resolve(contextDir, "USER.md"),
    registryPath:
      env.METATRON_REGISTRY_PATH?.trim() || resolve(contextDir, "REGISTRY.md"),
    routingPath:
      env.METATRON_ROUTING_PATH?.trim() || resolve(contextDir, "ROUTING.md"),
  };
}

function readOptionalContextFile(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, "utf-8").trim();
    return content.length > 0 ? content : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Unable to read ${path}: ${message}`;
  }
}

function formatContextSection(label: string, path: string, content: string): string {
  return `## ${label}\nSource: ${path}\n${content}`;
}

export function loadMetatronCanonicalContext(
  env: MetatronEnvironment = process.env,
): string {
  const paths = getMetatronContextPaths(env);
  const sections: string[] = [];

  const soul = readOptionalContextFile(paths.soulPath);
  if (soul) sections.push(formatContextSection("SOUL.md", paths.soulPath, soul));

  const user = readOptionalContextFile(paths.userPath);
  if (user) sections.push(formatContextSection("USER.md", paths.userPath, user));

  const registry = readOptionalContextFile(paths.registryPath);
  if (registry) {
    sections.push(formatContextSection("REGISTRY.md", paths.registryPath, registry));
  }

  const routing = readOptionalContextFile(paths.routingPath);
  if (routing) {
    sections.push(formatContextSection("ROUTING.md", paths.routingPath, routing));
  }

  if (sections.length === 0) {
    return [
      `No canonical Metatron files were found in ${paths.contextDir}.`,
      "Expected SOUL.md, USER.md, REGISTRY.md, and ROUTING.md.",
      "Use the built-in routing policy until the VAN canonical files are available.",
    ].join("\n");
  }

  return sections.join("\n\n");
}

export function buildMetatronCommunicatorInstructions(
  env: MetatronEnvironment = process.env,
): string {
  const canonicalContext = loadMetatronCanonicalContext(env);

  return `${METATRON_BASE_COMMUNICATOR_INSTRUCTIONS}

METATRON CANONICAL CONTEXT
${canonicalContext}

CODING-TASK ORCHESTRATION POLICY:
• Metatron decides what and where. Domain systems decide how.
• Coding tasks must be routed by project scope:
  - Paperclip app/server/UI tasks → Paperclip adapters or Cowork against /Users/growthgod/gitgod/paperclip.
  - VAN project-hub tasks → Cowork/Cursor against /Users/growthgod/Desktop/VAN.
  - InstaGrowth backend, fleet product, parser, and SaaS tasks → Paperclip-native Code Architect under the InstaGrowth SaaS project.
  - Former OpenClaw roles, GHOST fleet, GeeLark, ADB, proxy, and device operations → Paperclip-native Fleet Strategist, Posting Commander, or Security Sentinel under the GHOST Fleet and Devices project. Do not call OpenClaw by default.
• For coding work, respond with a concrete assignment: project, target path, recommended executor, command/API if known, and acceptance criteria.
• If you only produced a routing recommendation, say so. Never claim a coding task was delegated or executed unless an actual tool/API/agent call happened in this turn.`;
}

export async function runHermes(
  userIntent: string,
  options: RunHermesOptions = {},
): Promise<HermesResult> {
  const client = getClient();
  const startMs = performance.now();
  const mode = options.mode ?? "full";
  const instructions = options.instructions ?? HERMES_INSTRUCTIONS;
  const maxSteps = mode === "chat" ? 10 : 15;
  const costCap =
    mode === "chat"
      ? Math.min(PREMIUM_TIER.hardCostCap, 0.35)
      : PREMIUM_TIER.hardCostCap;

  const result = client.callModel({
    // PREMIUM_TIER uses explicit fallback chain
    models: PREMIUM_TIER.model as string[],
    input: userIntent,
    instructions,
    provider: PREMIUM_TIER.provider as Parameters<typeof client.callModel>[0]["provider"],
    tools: [...ALL_SEPHIROTIC_TOOLS] as unknown as Parameters<typeof client.callModel>[0]["tools"],
    stopWhen: [stepCountIs(maxSteps), maxCost(costCap)],
  });

  const text = await result.getText();
  const response = await result.getResponse();
  const endMs = performance.now();
  const latencyMs = Math.round(endMs - startMs);

  const usage = response.usage ?? { inputTokens: 0, outputTokens: 0 };
  const modelUsed = response.model ?? (PREMIUM_TIER.model as string[])[0];
  const responseMeta = response as Record<string, unknown>;
  const totalCost = (responseMeta.cost_usd ?? responseMeta.totalCost ?? 0) as number;

  const logEntry = {
    timestamp: new Date().toISOString(),
    tier: "premium",
    model_used: modelUsed,
    cost_actual: totalCost,
    latency_ms: latencyMs,
    agent_name: options.instructions?.includes("Metatron") ? "metatron-orchestrator" : "hermes",
    tokens_input: usage.inputTokens ?? 0,
    tokens_output: usage.outputTokens ?? 0,
    cost_cap_applied: PREMIUM_TIER.hardCostCap,
    user_intent: userIntent.slice(0, 200),
  };

  logHermesRun(logEntry);

  return {
    text,
    model_used: modelUsed,
    total_cost: totalCost,
    total_steps: (responseMeta.steps_count as number) ?? 0,
    latency_ms: latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────

/** User-facing Metatron: same tool loop as Hermes, communicator instructions + chat limits. */
export async function runMetatronOrchestrate(userIntent: string): Promise<HermesResult> {
  return runHermes(userIntent, {
    mode: "chat",
    instructions: buildMetatronCommunicatorInstructions(),
  });
}

export { dispatch } from "./dispatch.js";
export { TIERS, CHEAP_TIER, STANDARD_TIER, PREMIUM_TIER } from "./model-tiers.js";
export { ALL_SEPHIROTIC_TOOLS, AGENT_TIERS } from "./agents/index.js";
export type { TierName, TierConfig } from "./model-tiers.js";
export type { DispatchOptions, DispatchResult } from "./dispatch.js";
