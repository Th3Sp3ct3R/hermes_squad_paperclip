/**
 * Zod schemas for each Sephirotic agent's tool input.
 *
 * These define the typed contract between Hermes (the orchestrator)
 * and each agent. Parameters use real music-domain names — tempo_bpm,
 * key_signature, motif_seed, voicing_register, etc.
 *
 * NOTE: Schemas are intentionally music-production-focused. This is a
 * sonic architecture system, not generic AI plumbing.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Shared enums / primitives
// ─────────────────────────────────────────────────────────────

export const KeySignature = z.enum([
  "C", "Cm", "D", "Dm", "E", "Em", "F", "Fm",
  "G", "Gm", "A", "Am", "B", "Bm",
  "Db", "Dbm", "Eb", "Ebm", "Gb", "Gbm", "Ab", "Abm", "Bb", "Bbm",
]).describe("Musical key signature (major implied, 'm' suffix for minor)");

export const ChakraId = z.enum([
  "ROOT", "SACRAL", "SOLAR", "HEART", "THROAT", "THIRD_EYE", "CROWN",
]).describe("Target chakra frequency band");

export const VoicingRegister = z.enum([
  "sub_bass", "bass", "low_mid", "mid", "upper_mid", "presence", "air",
]).describe("Frequency register for voicing placement");

export const TimeSignature = z.enum([
  "4/4", "3/4", "6/8", "5/4", "7/8", "12/8",
]).describe("Musical time signature");

// ─────────────────────────────────────────────────────────────
// Metatron — Seed Lattice / Meta-Structure
// PREMIUM tier. Generates the foundational frequency lattice
// that all other agents derive from.
// ─────────────────────────────────────────────────────────────

export const MetatronInput = z.object({
  intent: z.string().describe("User's high-level creative intent"),
  target_chakra: ChakraId,
  seed_frequency_hz: z.number().min(20).max(20000).describe("Base frequency in Hz for the lattice root"),
  harmonic_series_depth: z.number().int().min(1).max(16).default(7)
    .describe("Number of harmonic overtones to include in the seed lattice"),
  duration_seconds: z.number().min(30).max(600).default(180)
    .describe("Target duration of the generated piece"),
  density: z.enum(["sparse", "moderate", "dense"]).default("sparse")
    .describe("Textural density of the seed lattice"),
});

// ─────────────────────────────────────────────────────────────
// Raziel — Dual Mode: Motif Generation + Deep Research
// Chokmah (Wisdom). Keeper of the Sefer Raziel HaMalakh.
//
// Mode A (motif): STANDARD tier. Melodic/rhythmic motifs from seed.
// Mode B (research): PREMIUM tier. Deep research via skills index.
// ─────────────────────────────────────────────────────────────

export const ResearchDomain = z.enum([
  "music_production", "sound_design", "ai_agents", "audio_engineering",
  "frequency_healing", "generative_art", "distribution", "marketing",
  "hermetic_philosophy", "general",
]).describe("Knowledge domain for research scoping");

export const ResearchDepth = z.enum([
  "quick", "standard", "deep",
]).describe("Research depth — quick (surface scan), standard (multi-source), deep (exhaustive)");

export const RazielMotifInput = z.object({
  operation_mode: z.literal("motif").default("motif")
    .describe("Motif generation mode"),
  motif_seed: z.string().describe("Seed lattice hash or description from Metatron"),
  key_signature: KeySignature,
  scale_mode: z.enum([
    "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian",
    "harmonic_minor", "melodic_minor", "whole_tone", "chromatic",
  ]).describe("Modal scale for motif generation"),
  interval_palette: z.array(z.number().int().min(1).max(12)).min(2).max(7)
    .describe("Allowed intervals in semitones (e.g. [1,3,5,7] for dark minor)"),
  motif_length_beats: z.number().int().min(2).max(32).default(8)
    .describe("Length of generated motif in beats"),
  register: VoicingRegister,
});

export const RazielResearchInput = z.object({
  operation_mode: z.literal("research")
    .describe("Deep research mode"),
  query: z.string().min(10).describe("Research question or topic to investigate"),
  depth: ResearchDepth.default("standard"),
  domain: ResearchDomain.default("general"),
  frameworks: z.array(z.string()).max(3).default([])
    .describe("Up to 3 research skill IDs to apply as frameworks (e.g. 'gpt-researcher', 'jina-deep-research')"),
  output_format: z.enum(["structured_json", "narrative", "brief"]).default("structured_json")
    .describe("Output format for research results"),
  context: z.string().optional()
    .describe("Optional pipeline context — current issue ID, sound parameters, etc."),
});

export const RazielInput = z.discriminatedUnion("operation_mode", [
  RazielMotifInput,
  RazielResearchInput,
]);

// ─────────────────────────────────────────────────────────────
// Jophiel — Visual Art / Aesthetic Beauty
// STANDARD tier. Generates cover art prompts from sonic data.
// ─────────────────────────────────────────────────────────────

export const JophielInput = z.object({
  sonic_description: z.string().describe("Textual description of the sound's character"),
  target_chakra: ChakraId,
  color_temperature: z.enum(["cold", "neutral", "warm"]).default("cold")
    .describe("Dominant color temperature for the visual"),
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3"]).default("1:1")
    .describe("Output image aspect ratio"),
  style_references: z.array(z.string()).max(5).default([])
    .describe("Artist/style references (e.g. 'Zdzisław Beksiński', 'dark surrealism')"),
  mood_keywords: z.array(z.string()).min(1).max(10)
    .describe("Mood descriptors for visual translation"),
});

// ─────────────────────────────────────────────────────────────
// Zadkiel — Lyrics / Mercy & Transmutation
// STANDARD tier. Writes chakra-resonant lyrics or [Instrumental].
// ─────────────────────────────────────────────────────────────

export const ZadkielInput = z.object({
  theme: z.string().describe("Lyrical theme or concept"),
  target_chakra: ChakraId,
  vocal_style: z.enum(["spoken_word", "melodic", "chant", "whisper", "instrumental"])
    .default("instrumental")
    .describe("Vocal delivery style — 'instrumental' means write [Instrumental] tag"),
  syllable_density: z.enum(["sparse", "moderate", "dense"]).default("sparse")
    .describe("How many syllables per beat on average"),
  rhyme_scheme: z.enum(["ABAB", "AABB", "free", "internal", "none"]).default("free")
    .describe("Target rhyme structure"),
  tempo_bpm: z.number().int().min(40).max(200).describe("Tempo for syllable timing"),
  language: z.enum(["en", "la", "he", "sa"]).default("en")
    .describe("Primary language (en=English, la=Latin, he=Hebrew, sa=Sanskrit)"),
});

// ─────────────────────────────────────────────────────────────
// Michael — Commander / Dispatch Articulation
// STANDARD tier. Orchestrates agent assignments and sequencing.
// ─────────────────────────────────────────────────────────────

export const MichaelInput = z.object({
  task_description: z.string().describe("What needs to be accomplished"),
  urgency: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  agents_available: z.array(z.string()).describe("List of agent names currently idle"),
  constraints: z.array(z.string()).default([])
    .describe("Hard constraints (budget, time, quality gates)"),
  pipeline_stage: z.enum(["draft", "generating", "review", "approved", "published", "failed"])
    .describe("Current pipeline status for context"),
});

// ─────────────────────────────────────────────────────────────
// Raphael — Harmonization / Healing / Gatekeeper
// PREMIUM tier. Reviews and harmonizes outputs from other agents.
// ─────────────────────────────────────────────────────────────

export const RaphaelInput = z.object({
  artifact_type: z.enum(["lyrics", "sound_prompt", "visual_prompt", "motif", "release_copy", "full_mix"])
    .describe("Type of artifact being reviewed"),
  artifact_content: z.string().describe("The actual content to review"),
  target_chakra: ChakraId,
  quality_threshold: z.number().min(0).max(1).default(0.8)
    .describe("Minimum quality score to approve (0-1)"),
  harmonic_coherence_check: z.boolean().default(true)
    .describe("Whether to verify tonal consistency with the seed lattice"),
  rejection_reasons_if_any: z.array(z.string()).default([])
    .describe("Pre-existing concerns to evaluate"),
});

// ─────────────────────────────────────────────────────────────
// Uriel — Sound Prompt / EQ / Frequency Sculpting
// CHEAP tier. Writes structured Suno description text.
// ─────────────────────────────────────────────────────────────

export const UrielInput = z.object({
  genre_tags: z.array(z.string()).min(1).max(8)
    .describe("Genre/style tags for Suno (e.g. 'dark ambient', 'drone')"),
  tempo_bpm: z.number().int().min(0).max(200)
    .describe("Target BPM (0 = no rhythm / drone)"),
  key_signature: KeySignature,
  frequency_bias: VoicingRegister.default("low_mid")
    .describe("Dominant frequency register to emphasize"),
  texture_descriptors: z.array(z.string()).min(1).max(6)
    .describe("Sound texture keywords (e.g. 'granular', 'tape_saturated', 'reverb_wash')"),
  exclude_styles: z.array(z.string()).default([])
    .describe("Styles to explicitly exclude from the prompt"),
  duration_hint_seconds: z.number().min(30).max(300).default(120),
});

// ─────────────────────────────────────────────────────────────
// Gabriel — Release Copy / Messenger
// STANDARD tier. Writes captions, hashtags, release notes.
// ─────────────────────────────────────────────────────────────

export const GabrielInput = z.object({
  track_title: z.string().describe("Title of the track"),
  sonic_summary: z.string().describe("Brief description of what it sounds like"),
  target_platforms: z.array(z.enum(["instagram", "twitter", "spotify", "bandcamp", "youtube"]))
    .min(1).describe("Distribution platforms for tailored copy"),
  tone: z.enum(["mystical", "minimal", "technical", "poetic", "provocative"]).default("minimal")
    .describe("Voice/tone for the copy"),
  hashtag_count: z.number().int().min(3).max(30).default(10),
  include_credits: z.boolean().default(true)
    .describe("Whether to include production credits in release notes"),
});

// ─────────────────────────────────────────────────────────────
// Sandalphon — Publisher / Earthing / Distribution
// STANDARD tier. Handles DistroKid metadata and submission.
// ─────────────────────────────────────────────────────────────

export const SandalphonInput = z.object({
  track_title: z.string(),
  artist_name: z.string().default("Null Angel"),
  isrc: z.string().optional().describe("ISRC code if pre-assigned"),
  upc: z.string().optional().describe("UPC/EAN for the release"),
  release_date: z.string().describe("ISO date string for release (YYYY-MM-DD)"),
  distributor: z.enum(["distrokid", "tunecore", "manual"]).default("distrokid"),
  territories: z.array(z.string()).default(["worldwide"])
    .describe("Territory codes or 'worldwide'"),
  explicit_content: z.boolean().default(false),
  genre_primary: z.string().describe("Primary genre for store categorization"),
  genre_secondary: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────
// Cassiel — Timing / Planetary Hours / Scheduler
// CHEAP tier. Determines optimal timing for operations.
// ─────────────────────────────────────────────────────────────

export const CassielInput = z.object({
  operation: z.enum(["schedule_release", "determine_planetary_hour", "calculate_window", "timing_audit"])
    .describe("What timing operation to perform"),
  target_planet: z.enum(["saturn", "jupiter", "mars", "sun", "venus", "mercury", "moon"]).optional()
    .describe("Preferred planetary ruler for the operation"),
  latitude: z.number().min(-90).max(90).default(40.7128)
    .describe("Latitude for astronomical calculation (default: NYC)"),
  longitude: z.number().min(-180).max(180).default(-74.006)
    .describe("Longitude for astronomical calculation (default: NYC)"),
  time_signature: TimeSignature.optional()
    .describe("Musical time signature for rhythmic alignment"),
});
