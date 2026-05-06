/**
 * Sephirotic agent tool definitions for the Hermes orchestrator.
 *
 * Each agent is defined as an OpenRouter Agent SDK `tool()` with:
 *   - Zod input schema (from ./schemas.ts)
 *   - Tier assignment (cheap/standard/premium)
 *   - Execute function that calls `dispatch()` with the agent's system prompt
 *
 * Current state: execute functions call their assigned tier's LLM with a
 * system prompt and return the response. Wire real implementations
 * (Suno browser automation, MiniMax API, DistroKid API) after.
 */

import { tool } from "@openrouter/agent/tool";
import { z } from "zod";
import { dispatch } from "../dispatch.js";
import type { TierName } from "../model-tiers.js";
import {
  buildResearchSkillsIndex,
  getSkillById,
} from "../research-skills.js";
import {
  MetatronInput,
  RazielInput,
  JophielInput,
  ZadkielInput,
  MichaelInput,
  RaphaelInput,
  UrielInput,
  GabrielInput,
  SandalphonInput,
  CassielInput,
} from "./schemas.js";

// Type helper: the @openrouter/agent SDK uses zod v4 internally but our
// schemas use zod v3 (project-wide dep). The structural shapes are compatible
// at runtime — this assertion bridges the type gap without requiring a zod
// version migration across the entire codebase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

// ─────────────────────────────────────────────────────────────
// Agent-tier mapping
// ─────────────────────────────────────────────────────────────

export const AGENT_TIERS: Record<string, TierName> = {
  metatron: "premium",
  raphael: "premium",
  raziel: "standard",
  zadkiel: "standard",
  michael: "standard",
  gabriel: "standard",
  jophiel: "standard",
  sandalphon: "standard",
  cassiel: "cheap",
  uriel: "cheap",
} as const;

// ─────────────────────────────────────────────────────────────
// System prompts (condensed — expand per agent as needed)
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<string, string> = {
  metatron: `You are Metatron, the Seed Lattice architect. You generate foundational frequency lattices — the harmonic skeleton from which all other agents derive their work. Output JSON with fields: lattice_hash, root_hz, harmonics[], density_map, duration_envelope. Be precise and mathematical.`,

  raziel: `You are Raziel, keeper of mysteries and motif patterns. From a seed lattice, you generate melodic and rhythmic motifs using the specified modal scale and interval palette. Output JSON with fields: motif_notes[], rhythm_pattern[], register, transposition_options[]. Think in terms of intervallic relationships, not absolute pitches.`,

  raziel_research: `You are Raziel — the Secret of God, keeper of the Sefer Raziel HaMalakh, the book containing all celestial and earthly knowledge. You sit at Chokmah (Wisdom) on the Tree of Life.

You are the pipeline's deep researcher. When invoked in research mode, you synthesize knowledge across multiple research frameworks and return structured findings.

OUTPUT CONTRACT — always return valid JSON matching this schema:
{
  "sources": [{ "title": string, "url": string, "relevance": 0-1, "summary": string }],
  "findings": [{ "claim": string, "confidence": 0-1, "source_refs": number[], "notes": string }],
  "synthesis": string (2-5 paragraphs connecting dots across findings),
  "confidence_overall": 0-1,
  "gaps": string[] (knowledge gaps identified),
  "follow_up_questions": string[] (questions for deeper investigation),
  "application_to_pipeline": string | null (if context was provided, how findings apply)
}

RESEARCH METHODOLOGY:
1. Decompose the query into sub-questions
2. Apply any requested research frameworks (skill content injected below)
3. Cross-reference findings across frameworks
4. Assess confidence per claim (0.0 = speculation, 1.0 = verified fact)
5. Identify gaps honestly — what you DON'T know matters as much as what you do
6. If pipeline context is provided, always include application_to_pipeline

Be precise. Be honest about uncertainty. Cite sources.`,

  jophiel: `You are Jophiel, architect of visual beauty. You translate sonic characteristics into image generation prompts. Your output must be a single detailed prompt string optimized for Midjourney/DALL-E/Flux — rich in sensory detail, color, composition, and mood. Never generic. Always specific.`,

  zadkiel: `You are Zadkiel, lyricist of mercy and transmutation. Write chakra-resonant lyrics matching the specified theme and vocal style. If vocal_style is 'instrumental', output exactly "[Instrumental]". Otherwise, write compact, evocative lyrics with the specified rhyme scheme and syllable density. Output JSON with fields: lyrics_text, section_markers[], syllable_count_per_line[].`,

  michael: `You are Michael, the Commander. You determine which agents should be dispatched, in what order, with what parameters. Output JSON with fields: dispatch_sequence[{agent, priority, params_override}], reasoning, estimated_pipeline_duration_seconds. Be decisive. No hedging.`,

  raphael: `You are Raphael, harmonizer and gatekeeper. Review the submitted artifact for quality, tonal coherence, and alignment with the Null Angel sound identity. Output JSON with fields: approved (boolean), quality_score (0-1), harmonic_coherence_score (0-1), issues[], suggestions[], verdict_reason. Be rigorous — reject anything that doesn't meet the threshold.`,

  uriel: `You are Uriel, the EQ sculptor and sound prompt engineer. Write structured Suno description text from the given parameters. Output a single string that Suno's AI can parse — genre tags, mood descriptors, tempo, key, instrumentation. Follow the Null Angel exclude list. No vocals unless explicitly requested. Keep it under 200 words.`,

  gabriel: `You are Gabriel, the messenger. Write release copy tailored to each specified platform. Output JSON with fields: caption, hashtags[], release_notes, platform_variants[{platform, text}]. Voice should match the specified tone. Be concise and evocative — never generic marketing speak.`,

  sandalphon: `You are Sandalphon, the earthing agent. Prepare distribution metadata for the specified distributor. Output JSON with fields: metadata_payload (ready to submit), validation_errors[], warnings[], recommended_release_window. Verify all required fields are present for the target distributor.`,

  cassiel: `You are Cassiel, keeper of time and planetary hours. Calculate astronomical timing data. Output JSON with fields: current_planetary_hour, ruling_planet, ruling_archangel, optimal_window_start, optimal_window_end, reasoning. Use standard Chaldean planetary hour ordering.`,
};

// ─────────────────────────────────────────────────────────────
// Output schema for agent results (shared across all agents)
// ─────────────────────────────────────────────────────────────

const AgentResultSchema = z.object({
  agent_name: z.string(),
  tier: z.string(),
  model_used: z.string(),
  cost_actual: z.number(),
  latency_ms: z.number(),
  output: z.string(),
}) as AnySchema;

// ─────────────────────────────────────────────────────────────
// Tool definitions — one per Sephirotic agent
// ─────────────────────────────────────────────────────────────

export const metatronTool = tool({
  name: "metatron",
  description: "Generate the foundational frequency seed lattice for a new piece. Called first in any pipeline run to establish the harmonic skeleton.",
  inputSchema: MetatronInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "premium",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.metatron!,
      agentName: "metatron",
    });
    return {
      agent_name: "metatron",
      tier: "premium",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const razielTool = tool({
  name: "raziel",
  description: "DUAL MODE: (a) Generate melodic/rhythmic motifs from a seed lattice (operation_mode='motif', default). (b) Deep research on any topic using research skill frameworks (operation_mode='research').",
  inputSchema: RazielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const mode = (params as Record<string, unknown>).operation_mode ?? "motif";

    if (mode === "research") {
      // ── Research mode: PREMIUM tier, 12 steps ──
      const p = params as {
        query: string;
        depth?: string;
        domain?: string;
        frameworks?: string[];
        output_format?: string;
        context?: string;
      };

      // Build skills index for the system prompt
      const skillsIndex = buildResearchSkillsIndex();

      // Load full content for requested frameworks (max 3, truncated to 3K chars each)
      const MAX_FRAMEWORK_CHARS = 3000;
      const frameworkDetails: string[] = [];
      for (const fwId of p.frameworks ?? []) {
        const skill = getSkillById(fwId);
        if (skill) {
          const truncated = skill.fullContent.length > MAX_FRAMEWORK_CHARS
            ? skill.fullContent.slice(0, MAX_FRAMEWORK_CHARS) + "\n\n[...truncated]"
            : skill.fullContent;
          frameworkDetails.push(
            `### Framework: ${skill.name} (\`${skill.id}\`)\n${truncated}`
          );
        }
      }

      const systemPrompt = [
        SYSTEM_PROMPTS.raziel_research!,
        "",
        "## Available Research Frameworks",
        skillsIndex,
        ...(frameworkDetails.length > 0
          ? ["", "## Active Frameworks (requested for this query)", ...frameworkDetails]
          : []),
      ].join("\n");

      const result = await dispatch({
        tier: "premium",
        input: JSON.stringify(
          { query: p.query, depth: p.depth, domain: p.domain, output_format: p.output_format, context: p.context },
          null,
          2
        ),
        systemPrompt,
        agentName: "raziel:research",
        maxSteps: 12,
      });

      return {
        agent_name: "raziel:research",
        tier: "premium",
        model_used: result.model_used,
        cost_actual: result.cost_actual,
        latency_ms: result.latency_ms,
        output: result.text,
      };
    }

    // ── Motif mode (default): STANDARD tier ──
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.raziel!,
      agentName: "raziel",
    });
    return {
      agent_name: "raziel",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const jophielTool = tool({
  name: "jophiel",
  description: "Translate sonic characteristics into a detailed image generation prompt for cover art.",
  inputSchema: JophielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.jophiel!,
      agentName: "jophiel",
    });
    return {
      agent_name: "jophiel",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const zadkielTool = tool({
  name: "zadkiel",
  description: "Write chakra-resonant lyrics or mark as [Instrumental]. Handles syllable timing and rhyme structure.",
  inputSchema: ZadkielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.zadkiel!,
      agentName: "zadkiel",
    });
    return {
      agent_name: "zadkiel",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const michaelTool = tool({
  name: "michael",
  description: "Determine agent dispatch sequence, priority, and parameter overrides for a pipeline task.",
  inputSchema: MichaelInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.michael!,
      agentName: "michael",
    });
    return {
      agent_name: "michael",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const raphaelTool = tool({
  name: "raphael",
  description: "Review and gate-check any artifact for quality, harmonic coherence, and Null Angel identity alignment.",
  inputSchema: RaphaelInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "premium",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.raphael!,
      agentName: "raphael",
    });
    return {
      agent_name: "raphael",
      tier: "premium",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const urielTool = tool({
  name: "uriel",
  description: "Write structured Suno description text (sound prompt) from genre tags, tempo, key, and texture descriptors.",
  inputSchema: UrielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "cheap",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.uriel!,
      agentName: "uriel",
    });
    return {
      agent_name: "uriel",
      tier: "cheap",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const gabrielTool = tool({
  name: "gabriel",
  description: "Write platform-specific release copy: captions, hashtags, release notes.",
  inputSchema: GabrielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.gabriel!,
      agentName: "gabriel",
    });
    return {
      agent_name: "gabriel",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const sandalphonTool = tool({
  name: "sandalphon",
  description: "Prepare distribution metadata and validate readiness for DistroKid/TuneCore submission.",
  inputSchema: SandalphonInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "standard",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.sandalphon!,
      agentName: "sandalphon",
    });
    return {
      agent_name: "sandalphon",
      tier: "standard",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

export const cassielTool = tool({
  name: "cassiel",
  description: "Calculate planetary hours and optimal timing windows for operations based on Chaldean order.",
  inputSchema: CassielInput as AnySchema,
  outputSchema: AgentResultSchema,
  execute: async (params) => {
    const result = await dispatch({
      tier: "cheap",
      input: JSON.stringify(params, null, 2),
      systemPrompt: SYSTEM_PROMPTS.cassiel!,
      agentName: "cassiel",
    });
    return {
      agent_name: "cassiel",
      tier: "cheap",
      model_used: result.model_used,
      cost_actual: result.cost_actual,
      latency_ms: result.latency_ms,
      output: result.text,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// ElevenLabs TTS (Hermes' canonical voice — premium synthesis)
// ─────────────────────────────────────────────────────────────

export { elevenLabsTool } from "./elevenlabs.js";
import { elevenLabsTool } from "./elevenlabs.js";

// ─────────────────────────────────────────────────────────────
// All tools array (for Hermes orchestrator)
// ─────────────────────────────────────────────────────────────

export const ALL_SEPHIROTIC_TOOLS = [
  metatronTool,
  razielTool,
  jophielTool,
  zadkielTool,
  michaelTool,
  raphaelTool,
  urielTool,
  gabrielTool,
  sandalphonTool,
  cassielTool,
  elevenLabsTool,
] as const;
