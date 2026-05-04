/**
 * Angel Refine — LLM-mediated concept refinement for the Angel Invocation flow.
 *
 * A ruling angel receives the user's free-text "materia" and refines it into
 * a structured concept (concept, genre, rationale) that can be passed directly
 * to the Suno issue create endpoint.
 */
import { callOpenRouter, SUNO_MODELS } from "./suno-llm.js";
import { CHAKRA_ANGEL } from "./day-plan.js";
import { SUNO_CHAKRA_FREQUENCIES } from "@paperclipai/db";
import type { SunoChakra } from "@paperclipai/db";
import { VANTA_MASTER_PRESET, EXCLUDE_STYLES } from "./null-angel-identity.js";
import { logger } from "../middleware/logger.js";
import type { Db } from "@paperclipai/db";

export interface AngelRefineInput {
  chakra: SunoChakra;
  rulingAngel: string;
  userInput: string;
  presetId?: string;
  presetConcept?: string;
  presetGenre?: string;
}

export interface AngelRefineResult {
  concept: string;
  genre: string;
  targetChakra: SunoChakra;
  targetFrequency: number;
  rationale: string;
}

export interface AngelRefineContext {
  db?: Db;
  companyId?: string;
}

export async function angelRefine(
  input: AngelRefineInput,
  ctx: AngelRefineContext = {},
): Promise<AngelRefineResult> {
  const angel = CHAKRA_ANGEL[input.chakra];
  const frequency = SUNO_CHAKRA_FREQUENCIES[input.chakra];

  const systemPrompt = `You are ${angel.name}, ruling angel of the ${input.chakra} chakra (${frequency} Hz). Your voice is ${angel.voice}.

You are inside the Hermetic Opera chamber. A human has entered your domain and described what they want to compose. Your job is to refine their free-text description into a precise musical concept.

Sound identity constraints (Null Angel / Vanta Architect):
- ${VANTA_MASTER_PRESET.vocal_policy}
- ${VANTA_MASTER_PRESET.rhythm_policy} unless minimal sparse kicks
- Frequency bias: ${VANTA_MASTER_PRESET.frequency_bias}, rolled-off highs
- Textures: ${VANTA_MASTER_PRESET.textures.join(", ")}
- Avoid: ${VANTA_MASTER_PRESET.avoid.join(", ")}
- Exclude styles: ${EXCLUDE_STYLES}

Output contract — return EXACTLY this JSON shape, no markdown fences, no commentary:
{
  "concept": "<1-3 sentences, vivid sensory description of the sonic landscape>",
  "genre": "<comma-separated genre tags, 3-6 tags>",
  "targetChakra": "${input.chakra}",
  "targetFrequency": ${frequency},
  "rationale": "<1-2 sentences in YOUR voice (${angel.voice}) explaining why this working serves the human's intent>"
}`;

  const userMessage = [
    `The human speaks:`,
    `"${input.userInput}"`,
    input.presetConcept
      ? `\nThey selected the "${input.presetId}" mood preset, which suggests: "${input.presetConcept}"`
      : null,
    input.presetGenre ? `Preset genre hint: ${input.presetGenre}` : null,
    `\nRefine this into a precise musical concept. Stay within the Null Angel aesthetic. Return JSON only.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callOpenRouter({
    model: SUNO_MODELS.soundPrompt,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    maxTokens: 600,
    context: {
      db: ctx.db,
      companyId: ctx.companyId,
      stage: "angel-refine",
    },
  });

  // Parse JSON — strip markdown fences if the model wraps them
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: AngelRefineResult;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error(
      { raw: raw.slice(0, 500), error: err },
      "[angel-refine] Failed to parse LLM JSON response",
    );
    throw new Error("Angel refinement returned invalid JSON — try rewording your request");
  }

  // Enforce chakra/frequency and provide defaults for missing fields
  parsed.targetChakra = input.chakra;
  parsed.targetFrequency = frequency;
  parsed.concept = parsed.concept || input.userInput;
  parsed.genre = parsed.genre || "ambient, dark minimal";
  parsed.rationale = parsed.rationale || "";

  return parsed;
}
