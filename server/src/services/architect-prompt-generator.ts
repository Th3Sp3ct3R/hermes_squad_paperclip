/**
 * Architect Prompt Generator — implements the §10 generation procedure from
 * the "Architect / Null Angel Deep-Focus Suno Prompt Generator" spec.
 *
 * Accepts a target state string + optional constraints, maps to a brainwave
 * stack, calls Uriel (via OpenRouter/MiniMax), and returns a structured
 * ArchitectPromptContract with three distinct Suno Custom-mode fields.
 */
import { callOpenRouter } from "./suno-llm.js";
import {
  ARCHITECT_STATE_MAP,
  resolveArchitectState,
  tempoFromHz,
  buildArchitectUrielSystemPrompt,
  type ArchitectPromptContract,
  type ArchitectStack,
} from "./null-angel-identity.js";
import { logger } from "../middleware/logger.js";

export interface ArchitectPromptConstraints {
  bpm?: number;
  percussion?: boolean;
  length?: number;
}

/**
 * Generate a structured Architect prompt contract.
 * Follows §10 procedure: state → stack → styles → exclude → prompt → title.
 */
export async function generateArchitectPrompt(
  state: string,
  constraints: ArchitectPromptConstraints = {},
): Promise<ArchitectPromptContract> {
  // Step 1-2: resolve state → stack entry
  const stateKey = resolveArchitectState(state);
  const entry = ARCHITECT_STATE_MAP[stateKey];

  if (!entry) {
    throw new Error(`[ArchitectGen] Unknown state key: ${stateKey}`);
  }

  // Step 3-4: apply constraint overrides
  const percussionOverride = constraints.percussion ?? entry.percussion;
  const bpmRange = entry.bpm_range;

  // Step 2: tempo math — use midpoint or constraint override
  let bpm = constraints.bpm
    ?? (entry.brainwave_hz
        ? tempoFromHz(entry.brainwave_hz)[percussionOverride ? 1 : 0]
        : Math.round((bpmRange[0] + bpmRange[1]) / 2));

  // Clamp to range
  bpm = Math.max(bpmRange[0], Math.min(bpmRange[1], bpm));

  const stack: ArchitectStack = {
    brainwave_band: entry.brainwave_band,
    brainwave_hz: entry.brainwave_hz,
    carrier_hz: entry.carrier_hz,
    bpm,
    bpm_range: bpmRange,
    percussion: percussionOverride,
  };

  logger.info(
    { state, stateKey, bpm, carrier: stack.carrier_hz, hz: stack.brainwave_hz, percussion: stack.percussion },
    "[ArchitectGen] Resolved stack",
  );

  // Step 5-8: call Uriel with the Architect system prompt
  const systemPrompt = buildArchitectUrielSystemPrompt(stack, entry.label, entry.use_case);

  const userMessage = [
    `Target state: ${state}`,
    `Brainwave: ${stack.brainwave_band} @ ${stack.brainwave_hz ?? "edge"} Hz`,
    `Carrier: ${stack.carrier_hz ? `${stack.carrier_hz} Hz` : "none"}`,
    `BPM: ${stack.bpm} (range ${stack.bpm_range[0]}–${stack.bpm_range[1]})`,
    `Percussion: ${stack.percussion ? "yes — sparse + dry" : "none"}`,
    constraints.length ? `Target length: ${constraints.length} minutes (hint: keep loopable)` : null,
    "",
    "Generate the Architect prompt JSON now. Make it unique — vary the imagery and texture choices from any previous generation in this same mode.",
  ]
    .filter(Boolean)
    .join("\n");

  const rawResponse = await callOpenRouter({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.85,
    maxTokens: 800,
  });

  // Parse JSON response from Uriel
  const sunoFields = parseUrielResponse(rawResponse);

  // Build deterministic title: Band · BPM BPM — Use Case
  // e.g. "Theta 6Hz · 96 BPM — Deep Coding"
  const hzPart = stack.brainwave_hz ? ` ${stack.brainwave_hz}Hz` : "";
  sunoFields.title_suggestion =
    `${stack.brainwave_band}${hzPart} · ${stack.bpm} BPM — ${entry.use_case}`;

  return {
    label: entry.label,
    use_case: entry.use_case,
    arc: "Dark",
    stack,
    suno: sunoFields,
  };
}

/** Parse and validate Uriel's JSON output. Falls back gracefully on malformed output. */
function parseUrielResponse(raw: string): ArchitectPromptContract["suno"] {
  // Strip any accidental markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      styles?: string;
      exclude_styles?: string;
      prompt?: string;
      title_suggestion?: string;
    };

    if (!parsed.styles || !parsed.exclude_styles || !parsed.prompt) {
      throw new Error("Missing required fields in Uriel response");
    }

    return {
      styles: parsed.styles,
      exclude_styles: parsed.exclude_styles,
      prompt: parsed.prompt,
      title_suggestion: parsed.title_suggestion ?? "Null",
    };
  } catch (err) {
    logger.warn({ raw: raw.slice(0, 400), err }, "[ArchitectGen] JSON parse failed — using raw as prompt fallback");

    // Graceful fallback: use raw text as the prompt field
    return {
      styles: "dark minimalist ambient, ritual drone, cinematic drone, sub-bass focus, instrumental",
      exclude_styles: "vocals, singing, lyrics, melody, percussion, drums, hooks, buildup, drop, crescendo, edm, pop, trap, drill, lo-fi hip hop, vinyl crackle, rain, warm emotional piano, choir, orchestral swell, major key, hype, motivational, bright",
      prompt: raw.slice(0, 500),
      title_suggestion: "Null",
    };
  }
}
