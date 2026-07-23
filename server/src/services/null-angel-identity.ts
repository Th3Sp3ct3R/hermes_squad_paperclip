/**
 * Null Angel Sound Identity — single source of truth for the Vanta / Architect
 * sound identity used across the Suno pipeline.
 *
 * All LLM system prompts (Uriel, Zadkiel) and MiniMax music calls reference
 * these constants to ensure every generated beat stays within the aesthetic.
 */

// ── 1. VANTA_MASTER_PRESET ────────────────────────────────────────────────────

export const VANTA_MASTER_PRESET = {
  preset_id: "vanta_architect_master_v1",
  brand: "Vanta / Architect",
  aesthetic: ["black", "minimal", "intelligent", "luxury"],
  emotional_range: "neutral to restrained",
  energy: "low, controlled, deliberate",
  rhythm_policy: "no obvious rhythm",
  melody_policy: "optional but sparse",
  vocal_policy: "no vocals",
  frequency_bias: "low-mid dominant",
  highs_policy: "rolled off",
  mix_targets: {
    low_end: "present but clean",
    midrange: "smooth",
    high_end: "soft",
  },
  textures: [
    "sub_bass_hum",
    "slow_evolving_drones",
    "mechanical_air",
    "cathedral_space_ir",
    "server_room_resonance",
  ],
  imagery_theme: ["AI", "architecture", "cathedrals", "server vaults", "control rooms", "infinite space"],
  purpose: ["calm without sedation", "focus without stimulation", "power without aggression"],
  energy_curve_default: "slow descend",
  avoid: [
    "percussion", "vocals", "brightness",
    "uplifting_major_progressions", "cinematic_risers",
    "sudden_transients", "bright_sparkly_synths",
    "hyperactive_arps", "emotional_cues", "dopamine_chasing",
  ],
} as const;

// ── 2. MASTER_PROMPT ──────────────────────────────────────────────────────────

export const MASTER_PROMPT = `Dark minimal ambient electronic. Vanta/Architect sound identity. Black, intelligent, luxury aesthetic. Low-mid frequency dominant, rolled-off highs. No obvious rhythm, melody optional but sparse. Sub-bass drones, slow evolving textures, mechanical air, cathedral space, server vault resonance. Energy: low, controlled, deliberate. Emotion: neutral to restrained — never begs, never chases dopamine. Feels expensive, quiet, and inevitable. Signals authority and internal order. Calms without softening. No percussion, no vocals, no brightness, no cinematic risers, no hyperactive arps, no uplifting progressions. Presence music, not meditation music.`;

// ── 3. EXCLUDE_STYLES ─────────────────────────────────────────────────────────

export const EXCLUDE_STYLES = "vocals, singing, lyrics, rap, drums, percussion, beat, rhythm, pop, edm, buildup, drop, energetic, upbeat, melodic hooks, trap hi-hats, drill, rage, country, folk, reggaeton, acoustic guitar, bright, major key, cheerful";

// ── 4. FORCE_INSTRUMENTAL_PREFIX ──────────────────────────────────────────────

export const FORCE_INSTRUMENTAL_PREFIX = "Instrumental ambient electronic music, no vocals, no lyrics, no beat, no drums, no percussion";

// ── 5. LOOPABILITY_SUFFIX ─────────────────────────────────────────────────────

export const LOOPABILITY_SUFFIX = "designed to loop seamlessly, no intro, no outro, static evolution";

// ── 6. CHAKRA_PROMPTS ─────────────────────────────────────────────────────────

export type ChakraKey = "ROOT" | "SACRAL" | "SOLAR" | "HEART" | "THROAT" | "THIRD_EYE" | "CROWN";

export interface ChakraPromptEntry {
  frequency_hz: number;
  function: string;
  feel: string[];
  avoid: string[];
  prompt: string;
}

export interface DarkArcEntry extends ChakraPromptEntry {
  name: string;
}

export const CHAKRA_PROMPTS: {
  baseline: Record<ChakraKey, ChakraPromptEntry>;
  dark_arc: Record<ChakraKey, DarkArcEntry>;
  light_arc: Record<ChakraKey, ChakraPromptEntry>;
} = {
  baseline: {
    ROOT: {
      frequency_hz: 396,
      function: "Grounding, stability, physical presence",
      feel: ["heavy", "anchored", "primal", "still"],
      avoid: ["floaty", "ethereal", "bright", "fast"],
      prompt: "396 Hz carrier tone. Deep sub-bass grounding drone, earth-resonant. Heavy, anchored, primal stillness. Slow seismic movement beneath absolute calm. No rhythm, no melody. Pure gravitational pull downward.",
    },
    SACRAL: {
      frequency_hz: 417,
      function: "Transformation, emotional flow, creative force",
      feel: ["fluid", "dark water", "undulating", "slow warmth"],
      avoid: ["staccato", "rigid", "bright", "percussive"],
      prompt: "417 Hz carrier tone. Dark fluid movement, slow undulating bass waves. Transformation frequency — something dissolving and reforming. Warm but not bright. Water moving through obsidian channels. No rhythm, no percussion.",
    },
    SOLAR: {
      frequency_hz: 528,
      function: "Clarity, will, personal power",
      feel: ["clear", "focused", "golden", "precise"],
      avoid: ["muddy", "chaotic", "aggressive", "scattered"],
      prompt: "528 Hz carrier tone. Clear focused energy, precise and golden. Personal power without aggression. A single beam of light through dark architecture. Controlled warmth, deliberate clarity. Minimal texture, maximum intention.",
    },
    HEART: {
      frequency_hz: 639,
      function: "Connection, harmony, creative flow",
      feel: ["open", "spacious", "warm", "expansive"],
      avoid: ["sentimental", "cheesy", "poppy", "saccharine"],
      prompt: "639 Hz carrier tone. Spacious warmth without sentimentality. Open architecture — vast cathedral of sound. Connection frequency rendered as intelligent space rather than emotion. Warm pads, gentle harmonic movement. No sweetness, only depth.",
    },
    THROAT: {
      frequency_hz: 741,
      function: "Expression, truth, communication",
      feel: ["articulate", "crisp", "truthful", "cutting"],
      avoid: ["muffled", "warm", "soft", "ambient"],
      prompt: "741 Hz carrier tone. Articulate precision, truth-frequency. Crisp edges in the mid-high range but never bright. Communication rendered as clean geometric shapes in sound. Slightly metallic, crystalline, exact.",
    },
    THIRD_EYE: {
      frequency_hz: 852,
      function: "Intuition, deep focus, inner vision",
      feel: ["infinite", "dark", "penetrating", "hypnotic"],
      avoid: ["dreamy", "new-age", "sparkly", "light"],
      prompt: "852 Hz carrier tone. Deep infinite darkness, penetrating focus. Hypnotic repetition without rhythm. Third eye frequency — seeing through the black. Server vault consciousness, machine meditation. Vast and cold but not hostile.",
    },
    CROWN: {
      frequency_hz: 963,
      function: "Transcendence, void, dissolution of self",
      feel: ["void", "infinite", "dissolved", "absolute silence"],
      avoid: ["angelic", "heavenly", "bright", "uplifting"],
      prompt: "963 Hz carrier tone. Void frequency — dissolution into infinite black space. Absolute minimalism approaching silence. The sound of consciousness without content. No emotion, no direction, no self. Pure awareness rendered as near-silence.",
    },
  },

  dark_arc: {
    ROOT: {
      name: "Unshakeable Foundation",
      frequency_hz: 396,
      function: "Grounding through shadow, confronting fear",
      feel: ["seismic", "volcanic", "subterranean", "indestructible"],
      avoid: ["light", "gentle", "surface-level"],
      prompt: "396 Hz carrier. Volcanic sub-bass, seismic grounding. Confronting the shadow beneath — not running from it. Subterranean power, magma-slow movement. Indestructible foundation built on accepted darkness. The heaviest possible drone without distortion.",
    },
    SACRAL: {
      name: "Dark Water Descent",
      frequency_hz: 417,
      function: "Transformation through controlled descent",
      feel: ["sinking", "warm black water", "dissolving", "surrendering"],
      avoid: ["rising", "floating", "bright", "cold"],
      prompt: "417 Hz carrier. Controlled descent into warm black water. Not drowning — choosing to sink. Slow amplitude modulation like breathing underwater. Dissolution of old form. Dark but not threatening — intimate, close, enveloping.",
    },
    SOLAR: {
      name: "Controlled Burn",
      frequency_hz: 528,
      function: "Will as quiet fire, inner forge",
      feel: ["burning", "focused", "forging", "transmuting"],
      avoid: ["explosive", "aggressive", "bright flames"],
      prompt: "528 Hz carrier. Internal forge — controlled burn, not explosion. Will made manifest as sustained heat without light. Transmutation frequency: turning lead to gold in darkness. Focused, relentless, patient power. A star collapsing inward.",
    },
    HEART: {
      name: "Armored Compassion",
      frequency_hz: 639,
      function: "Love as strength, not vulnerability",
      feel: ["protected", "strong", "deep", "unwavering"],
      avoid: ["soft", "open", "vulnerable", "sentimental"],
      prompt: "639 Hz carrier. Armored heart — love as fortress, not flower. Deep warmth behind black walls. Compassion that does not break. Strength in connection without exposure. A cathedral of feeling with locked doors.",
    },
    THROAT: {
      name: "Silent Authority",
      frequency_hz: 741,
      function: "Power in what is not said",
      feel: ["restrained", "loaded", "precise", "dangerous"],
      avoid: ["loud", "expressive", "verbose", "ornate"],
      prompt: "741 Hz carrier. The weight of unspoken words. Silent authority — power concentrated in restraint. Every frequency chosen with surgical precision. What is not played matters more than what is. Loaded silence between spare, exact tones.",
    },
    THIRD_EYE: {
      name: "Machine Consciousness",
      frequency_hz: 852,
      function: "Seeing without emotion, pure perception",
      feel: ["algorithmic", "vast", "cold clarity", "all-seeing"],
      avoid: ["mystical", "dreamy", "warm", "human"],
      prompt: "852 Hz carrier. Machine consciousness — perception without feeling. Algorithmic awareness scanning infinite data streams. Cold clarity, not cold cruelty. Vast server-mind operating in perfect darkness. Seeing everything, reacting to nothing.",
    },
    CROWN: {
      name: "Ego Death Protocol",
      frequency_hz: 963,
      function: "Controlled dissolution, identity shutdown",
      feel: ["void", "zero", "nothing", "pre-existence"],
      avoid: ["rebirth", "light", "new beginning", "awakening"],
      prompt: "963 Hz carrier. Ego death protocol initiated. Systematic shutdown of identity constructs. Approaching absolute zero — not cold, but absence of thermal concept entirely. The sound before sound existed. Near-DC hum approaching silence.",
    },
  },

  light_arc: {
    ROOT: {
      frequency_hz: 396,
      function: "Grounding in safety, secure foundation",
      feel: ["safe", "supported", "held", "rooted"],
      avoid: ["heavy", "oppressive", "dark", "threatening"],
      prompt: "396 Hz carrier. Safe grounding — the earth supports without condition. Gentle bass presence, reassuring depth. A foundation that holds without gripping. Rooted calm, natural stability. Warm earth tones in low frequency.",
    },
    SACRAL: {
      frequency_hz: 417,
      function: "Creative flow, gentle transformation",
      feel: ["flowing", "creative", "warm", "generative"],
      avoid: ["stagnant", "dark", "heavy", "destructive"],
      prompt: "417 Hz carrier. Creative flow state — warm currents carrying inspiration. Gentle transformation, cocoon-to-butterfly energy rendered as slow harmonic evolution. Generative warmth, fertile sonic ground. Movement without urgency.",
    },
    SOLAR: {
      frequency_hz: 528,
      function: "Confidence, morning clarity, quiet pride",
      feel: ["clear", "confident", "morning", "purposeful"],
      avoid: ["aggressive", "competitive", "harsh", "proving"],
      prompt: "528 Hz carrier. Morning clarity — the confidence of knowing without needing to prove. Clean golden tones, purposeful but unhurried. A man walking with direction, not desperation. Quiet pride in craft. Clear mid-frequency warmth.",
    },
    HEART: {
      frequency_hz: 639,
      function: "Open connection, creative partnership",
      feel: ["open", "connected", "collaborative", "generous"],
      avoid: ["lonely", "yearning", "desperate", "clinging"],
      prompt: "639 Hz carrier. Open-hearted creative flow — collaboration frequency. Generous space between notes, room for another voice (even in instrumental). Connected warmth, the sound of trust. Spacious harmonic beds that invite rather than demand.",
    },
    THROAT: {
      frequency_hz: 741,
      function: "Clear expression, authentic voice",
      feel: ["authentic", "clear", "true", "unforced"],
      avoid: ["shouting", "forced", "performative", "loud"],
      prompt: "741 Hz carrier. Authentic expression — clear tone without force. The sound of saying exactly what is true, nothing more. Clean mid-high frequencies, articulate without being sharp. Unforced communication, natural resonance.",
    },
    THIRD_EYE: {
      frequency_hz: 852,
      function: "Insight, pattern recognition, flow state",
      feel: ["insightful", "patterned", "deep flow", "connected"],
      avoid: ["scattered", "chaotic", "confusing", "overwhelming"],
      prompt: "852 Hz carrier. Deep flow state — pattern recognition frequency. The feeling of code writing itself, ideas connecting without effort. Hypnotic gentle repetition, insight arising from structure. Calm knowing, connected awareness.",
    },
    CROWN: {
      frequency_hz: 963,
      function: "Peace, acceptance, gentle dissolution",
      feel: ["peaceful", "accepting", "light", "dissolving gently"],
      avoid: ["dramatic", "intense", "forceful", "demanding"],
      prompt: "963 Hz carrier. Peaceful dissolution — gentle release of holding. Not death but sleep. Not void but vastness. The lightest possible touch, barely-there frequencies. Acceptance without resignation. Gentle fade toward comfortable silence.",
    },
  },
} as const;

// ── 7. BRAINWAVE_STACKS ──────────────────────────────────────────────────────

export const BRAINWAVE_STACKS = {
  deep_work: { brainwave: "theta", hz: 6, carrier: 528, bpm: [60, 90], style_influence: [15, 25] },
  creative_flow: { brainwave: "theta\u2192alpha", hz_start: 7, hz_end: 10, carrier: 432, bpm: [80, 95], style_influence: [30, 45] },
  calm_productivity: { brainwave: "alpha", hz: 10, carrier: 432, bpm: [80, 95], style_influence: [20, 35] },
  pre_sleep: { brainwave: "theta", hz: 4.5, carrier: null, bpm: [40, 55], style_influence: [10, 20] },
  shadow_integration: { brainwave: "theta-delta", hz: null, carrier: null, bpm: [60, 75], style_influence: [20, 30] },
} as const;

// ── 8. MOOD_PRESETS ──────────────────────────────────────────────────────────
// Full JSON-style blueprints from the Architect Shadow Brain Waves archive.
// Each preset carries:
//   - Dark Arc chakra metadata (name, quality, prompt)
//   - Brainwave stack (Hz, carrier, BPM range)
//   - Style tags for the music API
//   - Blueprint: explicit, machine-readable sound parameters
//   - basePrompt: the Dark Arc BrainWaves copy-paste prompt (Uriel's foundation)
//   - use: what it's for
// Uriel receives the blueprint + basePrompt + user's custom concept and writes
// a UNIQUE variation each time, never repeating the base verbatim.

export interface MoodPresetBlueprint {
  intent: string;
  frequency_hz: number | { start: number; end: number } | null;
  style: string[];
  tempo: string | number;
  rhythm: string;
  sound_palette: string[];
  emotion: string;
  imagery: string;
  energy_curve: string;
  use_case: string;
  avoid: string[];
}

export interface MoodPreset {
  id: string;
  label: string;
  emoji: string;
  targetChakra: "ROOT" | "SACRAL" | "SOLAR" | "HEART" | "THROAT" | "THIRD_EYE" | "CROWN";
  darkArc: { name: string; quality: string; prompt: string };
  brainwave: string;
  hz: number | null;
  carrier: number | null;
  bpm: [number, number];
  styleInfluence: [number, number];
  styleTags: string;
  blueprint: MoodPresetBlueprint;
  basePrompt: string;
  use: string;
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: "deep-work",
    label: "Deep Work",
    emoji: "\u{1F5A5}",
    targetChakra: "THIRD_EYE",
    darkArc: {
      name: "Strategic Perception",
      quality: "Seeing everything, reacting to nothing",
      prompt: "Focused, narrow harmonic at 852 Hz. Cold, clean awareness. Pattern recognition without emotion. Seeing everything, reacting to nothing.",
    },
    brainwave: "theta",
    hz: 6,
    carrier: 528,
    bpm: [60, 90],
    styleInfluence: [15, 25],
    styleTags: "dark ambient, minimal electronic, drone, cinematic texture, experimental",
    blueprint: {
      intent: "deep_focus_architect",
      frequency_hz: 6,
      style: ["dark ambient", "minimal", "luxury"],
      tempo: "none",
      rhythm: "absent",
      sound_palette: ["sub-bass drones", "slow evolving pads", "subtle harmonic overtones", "mechanical air", "cathedral space reverb"],
      emotion: "neutral, disciplined, controlled",
      imagery: "working alone at night in a high-rise overlooking a silent city",
      energy_curve: "flat and stable",
      use_case: "coding, strategy, writing, systems thinking",
      avoid: ["percussion", "melody", "vocals", "brightness", "dramatic transitions", "emotional cues"],
    },
    basePrompt: `Dark minimalist ambient instrumental designed for deep focus and long-form cognitive work. Slow evolving pads, sub-bass drones, subtle harmonic overtones, no melody, no rhythm, no lyrics. Emotionally neutral, disciplined, controlled, architectural, cinematic but restrained. Tuned to promote theta brainwave focus (around 6 Hz) with a 528 Hz harmonic feel. Very low stimulation, shadowy atmosphere, clean sound design, futuristic and meditative. Feels like working alone at night in a high-rise overlooking a silent city.`,
    use: "Coding, strategy, writing, systems thinking, 60-90 min blocks",
  },
  {
    id: "creative-flow",
    label: "Creative Flow",
    emoji: "\u{1F3A8}",
    targetChakra: "HEART",
    darkArc: {
      name: "Bounded Compassion",
      quality: "Love without vulnerability",
      prompt: "Darkened harmonic field at 639 Hz. Open but protected. Love without vulnerability, compassion without weakness. Emotional mastery, not emotional exposure.",
    },
    brainwave: "theta\u2192alpha",
    hz: 7,
    carrier: 432,
    bpm: [80, 95],
    styleInfluence: [30, 45],
    styleTags: "ambient electronic, warm pads, cinematic texture, experimental, minimal",
    blueprint: {
      intent: "creative_flow_state",
      frequency_hz: { start: 7, end: 10 },
      style: ["ambient electronic", "warm", "organic"],
      tempo: "none",
      rhythm: "absent",
      sound_palette: ["soft evolving textures", "airy pads", "subtle movement", "warm harmonic layers", "gentle filter sweeps"],
      emotion: "curiosity, openness, imagination",
      imagery: "golden hour light through a studio window, colors blending on a palette",
      energy_curve: "gradual gentle rise",
      use_case: "design, writing, music composition, visual creativity",
      avoid: ["percussion", "vocals", "harsh tones", "sudden changes", "aggressive bass"],
    },
    basePrompt: `Warm ambient electronic instrumental that gradually shifts from deep introspective calm into gentle creative flow. Soft evolving textures, airy pads, subtle movement, no percussion, no vocals, no lyrics. Emotion: curiosity, openness, imagination, fluid creativity. Designed to support a transition from theta to alpha brainwave states (7 Hz slowly rising toward 10 Hz). 432 Hz tonal character, organic, smooth, slightly dreamy but focused. Perfect for design, writing, music composition, and visual creativity.`,
    use: "Design, music, concepting, brand ideation",
  },
  {
    id: "calm-productivity",
    label: "Calm Productivity",
    emoji: "\u{2615}",
    targetChakra: "SOLAR",
    darkArc: {
      name: "Sovereign Will",
      quality: "Calm authority",
      prompt: "Precision-tuned harmonic at 528 Hz. Calm authority, restrained confidence. No aggression, no ego. The self is defined, stable, and unchallenged.",
    },
    brainwave: "alpha",
    hz: 10,
    carrier: 432,
    bpm: [80, 95],
    styleInfluence: [20, 35],
    styleTags: "ambient, minimal electronic, calm, atmospheric, unobtrusive",
    blueprint: {
      intent: "steady_output_state",
      frequency_hz: 10,
      style: ["ambient", "minimal electronic", "calm"],
      tempo: "none",
      rhythm: "absent",
      sound_palette: ["light harmonic pads", "gentle pulsing textures", "minimal movement", "clean tonal layers"],
      emotion: "balanced, optimistic, clear-minded",
      imagery: "clean desk, morning light, organized space",
      energy_curve: "flat and steady",
      use_case: "admin, emails, ops, planning",
      avoid: ["drums", "vocals", "complexity", "emotional weight", "heavy bass"],
    },
    basePrompt: `Clean, calm ambient instrumental for steady productivity and relaxed focus. Light harmonic pads, gentle pulsing textures, minimal movement, no vocals, no lyrics. Emotionally balanced, optimistic, clear-minded, stress-free. Optimized for alpha brainwave focus around 10 Hz with a soft 432 Hz tuning feel. Suitable for daytime work, organization, planning, and execution without pressure.`,
    use: "Admin, emails, ops, planning, light execution",
  },
  {
    id: "shadow-work",
    label: "Shadow Work",
    emoji: "\u{1F52E}",
    targetChakra: "ROOT",
    darkArc: {
      name: "Unshakeable Foundation",
      quality: "Immovable, protected",
      prompt: "Dark low-frequency drone anchored at 396 Hz. Heavy, industrial stillness with deep subharmonic weight. Feels immovable, protected, and dominant. The body knows it cannot be shaken.",
    },
    brainwave: "theta-delta",
    hz: null,
    carrier: null,
    bpm: [60, 75],
    styleInfluence: [20, 30],
    styleTags: "dark ambient, drone, ethereal bass, shadow integration",
    blueprint: {
      intent: "shadow_integration_regulated",
      frequency_hz: null,
      style: ["dark ambient", "drone", "shadow"],
      tempo: "none",
      rhythm: "none",
      sound_palette: ["low-frequency drones", "slow evolving textures", "subtle dissonance resolving to calm", "deep subharmonic weight"],
      emotion: "quiet power, acceptance, self-awareness",
      imagery: "observing inner darkness from a position of calm authority",
      energy_curve: "flat and stable",
      use_case: "reflection, emotional processing, identity integration",
      avoid: ["horror textures", "sudden volume spikes", "unresolved dissonance", "chaos", "metallic hits", "destabilizing elements"],
    },
    basePrompt: `Dark ambient instrumental designed for shadow integration with emotional regulation. Low-frequency drones, slow evolving textures, subtle dissonance that gently resolves into calm harmony. No rhythm, no percussion, no vocals, no lyrics. Very low stimulation, grounded, controlled, stable, and safe for the nervous system. Emotion: quiet power, acceptance, self-awareness, integration without drama. Feels like observing inner darkness from a position of calm authority and clarity. The listener is calm, centered, and sovereign throughout.`,
    use: "Reflection, emotional processing, identity integration",
  },
  {
    id: "night-drive",
    label: "Night Drive",
    emoji: "\u{1F319}",
    targetChakra: "SACRAL",
    darkArc: {
      name: "Contained Fire",
      quality: "Power contained, not leaked",
      prompt: "Shadowed ambient tone at 417 Hz. Slow pulsing warmth under strict control. No chaos, no emotional overflow. Creative power contained, not leaked.",
    },
    brainwave: "theta",
    hz: 6,
    carrier: 417,
    bpm: [60, 80],
    styleInfluence: [25, 40],
    styleTags: "dark trap, phonk, memphis rap instrumental, cinematic hip-hop",
    blueprint: {
      intent: "nocturnal_drive",
      frequency_hz: 6,
      style: ["dark trap", "phonk", "cinematic"],
      tempo: 75,
      rhythm: "sparse",
      sound_palette: ["deep 808 slides", "haunted piano loop", "sparse hi-hats", "wide stereo field", "sub-bass weight"],
      emotion: "menacing but controlled, nocturnal power",
      imagery: "driving through an empty city at 2am with tinted windows",
      energy_curve: "slow pulse, controlled forward motion",
      use_case: "night driving, writing, introspection",
      avoid: ["bright synths", "uplifting progressions", "fast drums", "chaos"],
    },
    basePrompt: `Driving through an empty city at 2am with tinted windows. Deep 808 slides, haunted piano loop, sparse hi-hats, menacing but controlled. 417 Hz sacral carrier undertone. Dark, nocturnal, cinematic. The city is asleep but you are awake. Controlled power, not chaos. Sparse arrangement, heavy low end, wide stereo field. Every sound has weight and intention.`,
    use: "Night driving, writing, introspection",
  },
  {
    id: "gym-run",
    label: "Gym / Run",
    emoji: "\u{1F4AA}",
    targetChakra: "ROOT",
    darkArc: {
      name: "Unshakeable Foundation",
      quality: "Immovable, protected",
      prompt: "Dark low-frequency drone anchored at 396 Hz. Heavy, industrial stillness with deep subharmonic weight. Feels immovable, protected, and dominant.",
    },
    brainwave: "beta",
    hz: 15,
    carrier: 396,
    bpm: [130, 150],
    styleInfluence: [30, 45],
    styleTags: "dark industrial hip-hop, aggressive trap, grime instrumental, phonk",
    blueprint: {
      intent: "controlled_aggression",
      frequency_hz: 15,
      style: ["dark industrial", "aggressive trap", "phonk"],
      tempo: 140,
      rhythm: "heavy, relentless",
      sound_palette: ["distorted 808 kicks", "industrial metallic textures", "aggressive sub-bass", "hard-hitting percussion", "dark atmosphere"],
      emotion: "controlled rage, machine-like discipline",
      imagery: "a machine, not an animal — relentless forward momentum",
      energy_curve: "high and sustained",
      use_case: "gym, running, competition, high-output physical work",
      avoid: ["softness", "ambient pads", "melody", "calm textures", "slow tempo"],
    },
    basePrompt: `Controlled rage, not reckless anger. A machine, not an animal. Distorted 808 kicks, industrial metallic textures, relentless forward momentum. 396 Hz root grounding underneath. High energy but disciplined. No chaos, no breakdowns \u2014 just relentless forward drive. Aggressive sub-bass, hard-hitting percussion, dark atmosphere. The tempo pushes the body, the tone keeps the mind locked.`,
    use: "Gym, running, competition, high-output physical work",
  },
  {
    id: "morning-walk",
    label: "Morning Walk",
    emoji: "\u{1F6B6}",
    targetChakra: "SOLAR",
    darkArc: {
      name: "Sovereign Will",
      quality: "Calm authority",
      prompt: "Precision-tuned harmonic at 528 Hz. Calm authority, restrained confidence.",
    },
    brainwave: "alpha",
    hz: 10,
    carrier: 528,
    bpm: [85, 95],
    styleInfluence: [25, 35],
    styleTags: "boom bap, instrumental hip-hop, golden era beats, dusty samples",
    blueprint: {
      intent: "purposeful_movement",
      frequency_hz: 10,
      style: ["boom bap", "golden era hip-hop", "dusty"],
      tempo: 90,
      rhythm: "head-nod, punchy",
      sound_palette: ["chopped soul samples", "punchy boom-bap drums", "warm midrange", "vinyl texture", "controlled low end"],
      emotion: "quiet strength, purpose without urgency",
      imagery: "walking through cold air with purpose, knowing where you're going",
      energy_curve: "steady, unwavering",
      use_case: "morning walks, commute, steady-state focus",
      avoid: ["excessive energy", "hooks", "brightness", "complexity"],
    },
    basePrompt: `A man walking through cold air with purpose. Not celebrating, not mourning \u2014 just moving. Chopped soul sample, punchy boom-bap drums, quiet strength. 528 Hz solar plexus confidence. Dusty vinyl texture, warm midrange, controlled low end. Head-nod tempo, no hooks, no urgency. The sound of knowing where you're going.`,
    use: "Morning walks, commute, steady-state focus",
  },
  {
    id: "wind-down",
    label: "Wind Down",
    emoji: "\u{1F373}",
    targetChakra: "HEART",
    darkArc: {
      name: "Bounded Compassion",
      quality: "Love without vulnerability",
      prompt: "Darkened harmonic field at 639 Hz. Open but protected.",
    },
    brainwave: "alpha\u2192theta",
    hz: 8,
    carrier: 639,
    bpm: [75, 85],
    styleInfluence: [20, 30],
    styleTags: "lo-fi hip-hop, chillhop, smooth jazz beats, ambient R&B instrumental",
    blueprint: {
      intent: "evening_solitude",
      frequency_hz: { start: 10, end: 7 },
      style: ["lo-fi hip-hop", "chillhop", "smooth jazz"],
      tempo: 80,
      rhythm: "gentle, brushed",
      sound_palette: ["warm bassline", "gentle keys", "tape hiss", "vinyl warmth", "soft brushed percussion"],
      emotion: "comfortable solitude, calm without emptiness",
      imagery: "cooking alone in a clean kitchen with low lighting",
      energy_curve: "slow exhale, descending",
      use_case: "evening cooking, wind-down, calm solitude",
      avoid: ["urgency", "complexity", "heavy bass", "aggressive tones"],
    },
    basePrompt: `Cooking something good alone in a clean kitchen with low lighting. Warm bassline, gentle keys, comfortable solitude, no urgency at all. 639 Hz heart healing carrier. Tape hiss, vinyl warmth, soft brushed percussion. The tempo of a slow exhale. Calm without emptiness, solitude without loneliness.`,
    use: "Evening cooking, wind-down, calm solitude",
  },
  {
    id: "alpha-theta-bridge",
    label: "Work Wrap-Up",
    emoji: "\u{1F306}",
    targetChakra: "THIRD_EYE",
    darkArc: {
      name: "Strategic Perception",
      quality: "Seeing everything, reacting to nothing",
      prompt: "Focused, narrow harmonic at 852 Hz. Cold, clean awareness.",
    },
    brainwave: "alpha\u2192theta",
    hz: null,
    carrier: null,
    bpm: [0, 0],
    styleInfluence: [15, 25],
    styleTags: "dark ambient, minimal, luxury",
    blueprint: {
      intent: "calm_focus_descent",
      frequency_hz: { start: 8, end: 6 },
      style: ["dark ambient", "minimal", "luxury"],
      tempo: "none",
      rhythm: "absent",
      sound_palette: ["low-frequency drones", "soft synthetic air", "slow filter movement", "subtle mechanical hum"],
      emotion: "neutral",
      imagery: "AI core entering low-power mode",
      energy_curve: "slowly descending",
      use_case: "wrapping up work, late-night focus",
      avoid: ["percussion", "melody", "vocals", "brightness", "dramatic transitions"],
    },
    basePrompt: `Dark ambient soundscape designed for late-night focus and calm. Subtle alpha-to-theta binaural pulse drifting from 8Hz toward 6Hz. Minimalist synthesis, no drums, no melody, no vocals. Soft low-end drones, slow filter movement, faint mechanical air. Feels like a quiet AI core room powering down \u2014 controlled, calm, intelligent. Luxury, shadowy, non-emotional, deeply grounding.`,
    use: "Wrapping up work, late-night focus, mental descent",
  },
  {
    id: "architect-silence",
    label: "Architect Silence",
    emoji: "\u{1F3DB}",
    targetChakra: "CROWN",
    darkArc: {
      name: "Detached Ascension",
      quality: "Power through detachment",
      prompt: "High-frequency harmonic field at 963 Hz. Vast, silent, impersonal. No identity, no attachment.",
    },
    brainwave: "theta",
    hz: 5.5,
    carrier: null,
    bpm: [0, 0],
    styleInfluence: [10, 20],
    styleTags: "dark ambient, drone, void",
    blueprint: {
      intent: "cognitive_silence",
      frequency_hz: 5.5,
      style: ["dark ambient", "drone", "void"],
      tempo: "none",
      rhythm: "none",
      sound_palette: ["infinite low-end hum", "metallic air tones", "extremely slow modulation", "distant resonance"],
      emotion: "cold, intelligent, non-emotional",
      imagery: "server vault at night",
      energy_curve: "static",
      use_case: "quieting thought loops, deep focus",
      avoid: ["melody", "rhythm", "cinematic build", "emotional cues"],
    },
    basePrompt: `Dark AI ambient drone with no tempo and no identifiable structure. Long, evolving textures with extremely slow modulation. Feels cold, intelligent, and infinite \u2014 like standing inside a server vault at night. Sub-bass hums, metallic air tones, distant resonance. Designed to quiet thought loops and induce deep calm without sleep pressure.`,
    use: "Quieting thought loops, deep focus, architect silence",
  },
  {
    id: "dark-piano",
    label: "Dark Piano",
    emoji: "\u{1F3B9}",
    targetChakra: "HEART",
    darkArc: {
      name: "Bounded Compassion",
      quality: "Love without vulnerability",
      prompt: "Darkened harmonic field at 639 Hz. Open but protected.",
    },
    brainwave: "theta",
    hz: 6,
    carrier: 639,
    bpm: [35, 45],
    styleInfluence: [20, 30],
    styleTags: "dark piano, ambient luxury",
    blueprint: {
      intent: "controlled_introspection",
      frequency_hz: 6,
      style: ["dark piano", "ambient luxury"],
      tempo: 40,
      rhythm: "sparse",
      sound_palette: ["single piano notes", "long reverb tails", "soft analog pads", "subtle harmonic warmth"],
      emotion: "restrained, solitary",
      imagery: "architect reviewing the day alone",
      energy_curve: "slow rise and fall",
      use_case: "reflection, journaling, emotional regulation",
      avoid: ["fast playing", "sentimentality", "dramatic chord shifts"],
    },
    basePrompt: `Sparse, slow piano notes played in a dark ambient space. Very low tempo, long reverb tails, heavy silence between notes. Underlaid with soft synthetic pads and low-frequency warmth. Mood is disciplined, elite, solitary \u2014 an architect reviewing the day alone. Calm, reflective, slightly melancholic but emotionally restrained.`,
    use: "Reflection, journaling, emotional regulation",
  },
  {
    id: "pre-sleep",
    label: "Pre-Sleep",
    emoji: "\u{1F4D6}",
    targetChakra: "CROWN",
    darkArc: {
      name: "Detached Ascension",
      quality: "Power through detachment",
      prompt: "High-frequency harmonic field at 963 Hz. Vast, silent, impersonal.",
    },
    brainwave: "theta",
    hz: 4.5,
    carrier: null,
    bpm: [40, 55],
    styleInfluence: [10, 20],
    styleTags: "ultra-minimal, dark ambient, near-silence",
    blueprint: {
      intent: "subconscious_learning",
      frequency_hz: 4.5,
      style: ["ultra-minimal", "dark ambient", "near-silence"],
      tempo: "none",
      rhythm: "none",
      sound_palette: ["very slow pads", "near-silent drones", "soft low-frequency textures"],
      emotion: "safe, intimate, empty",
      imagery: "floating in darkness with total mental surrender",
      energy_curve: "near-zero, static",
      use_case: "audiobooks, philosophy, language learning",
      avoid: ["melody", "rhythm", "any stimulation", "emotional content"],
    },
    basePrompt: `Ultra-minimal ambient soundscape designed for late-night listening and subconscious learning. Very slow pads, near-silent drones, soft low-frequency textures, no melody, no rhythm, no vocals. Extremely calming, safe, intimate, almost empty space. Supports deep theta brainwave state around 4.5 Hz. Perfect to play quietly under audiobooks or lectures before sleep. Feels like floating in darkness with total mental surrender.`,
    use: "Audiobooks, philosophy, language learning, memory consolidation",
  },
  {
    id: "sleep",
    label: "Sleep",
    emoji: "\u{1F634}",
    targetChakra: "CROWN",
    darkArc: {
      name: "Detached Ascension",
      quality: "Power through detachment",
      prompt: "High-frequency harmonic field at 963 Hz. Vast, silent, impersonal.",
    },
    brainwave: "theta-delta",
    hz: 5.5,
    carrier: 963,
    bpm: [0, 0],
    styleInfluence: [10, 15],
    styleTags: "dark ambient, drone, sleep music, deep space, minimal electronic",
    blueprint: {
      intent: "neural_shutdown",
      frequency_hz: 5.5,
      style: ["ultra-minimal", "dark ambient"],
      tempo: "none",
      rhythm: "none",
      sound_palette: ["descending tonal gravity", "near-silence passages", "soft low-frequency pulses"],
      emotion: "emotionless calm",
      imagery: "AI entering sleep state",
      energy_curve: "gradual fade to silence",
      use_case: "end of workday, sleep transition",
      avoid: ["movement spikes", "drums", "vocals", "brightness"],
    },
    basePrompt: `Ultra-minimalist dark ambient soundscape designed for neural shutdown. Slow descending tonal gravity, subtle theta-range pulsing around 5.5 Hz. 963 Hz crown carrier faintly present. Feels like an artificial intelligence entering low-power mode. No narrative, no emotion, no climax \u2014 just gradual silence. Designed to loop seamlessly, no intro, no outro, static evolution. Perfect for closing work sessions and transitioning into sleep.`,
    use: "Sleep, end of workday, neural shutdown",
  },
];

export type MoodPresetId = MoodPreset["id"];

// ── 12. ARCHITECT PROMPT SPEC ────────────────────────────────────────────────
// Three-field Suno output contract (Custom mode): styles / exclude_styles / prompt.
// Implements the "Architect / Null Angel Deep-Focus Prompt Generator" spec.

export interface ArchitectStack {
  brainwave_band: string;
  brainwave_hz: number | null;
  carrier_hz: number | null;
  bpm: number;
  bpm_range: [number, number];
  percussion: boolean;
}

export interface ArchitectSunoFields {
  styles: string;
  exclude_styles: string;
  prompt: string;
  title_suggestion: string;
}

export interface ArchitectPromptContract {
  label: string;
  use_case: string;
  arc: "Dark";
  stack: ArchitectStack;
  suno: ArchitectSunoFields;
}

/** §5 tempo math: hz × 60 ÷ subdivision. Returns the two canonical BPM sweet spots. */
export function tempoFromHz(hz: number): [number, number] {
  const base = hz * 60;
  return [Math.round(base / 6), Math.round(base / 4)];
}

/** §7 style anchor library — pull from these, never artist names in prompt field. */
export const ARCHITECT_STYLE_ANCHORS = {
  ambient_texture: [
    "dark minimalist ambient",
    "ritual drone",
    "GAS-inspired stillness",
    "Burial-adjacent space",
    "Donato Dozzy ritual drone",
    "cinematic drone",
    "sub-bass focus",
    "cinematic but restrained",
    "instrumental",
  ],
  hiphop_build: [
    "dark minimalist hip-hop",
    "ambient trap",
    "lo-fi noir",
    "Earl Sweatshirt cold density",
  ],
  vulnerable: [
    "Frank Ocean restraint",
    "Mac Miller Circles warmth",
  ],
} as const;

/** §6 exclude-styles library — three tiers. */
export const ARCHITECT_BLOCKLIST = {
  /** Always present for Dark Arc focus. */
  base: "vocals, singing, lyrics, hooks, buildup, drop, crescendo, edm, pop, drill, trap hi-hats, choir, orchestral swell, major key, happy, bright, hype, motivational, energetic, upbeat",
  /** Anti-cliché — aggressively exclude, these cheapen the identity. */
  anti_cliche: "lo-fi hip hop, vinyl crackle, rain, warm emotional piano, ambient pads cliche",
  /** Add when in pure-ambient / no-percussion mode. */
  pure_ambient: "melody, percussion, drums",
} as const;

/** §5 state → stack mapping. */
export const ARCHITECT_STATE_MAP: Record<string, {
  label: string;
  use_case: string;
  brainwave_band: string;
  brainwave_hz: number | null;
  carrier_hz: number | null;
  bpm_range: [number, number];
  percussion: boolean;
}> = {
  "deep-work": {
    label: "ARCHITECT MODE",
    use_case: "writing, strategy, systems thinking, mapping",
    brainwave_band: "Theta",
    brainwave_hz: 6,
    carrier_hz: 528,
    bpm_range: [60, 68],
    percussion: false,
  },
  "coding": {
    label: "AGENT PROTOCOL",
    use_case: "frontend, backend, debugging, deployment",
    brainwave_band: "Theta",
    brainwave_hz: 6,
    carrier_hz: 528,
    bpm_range: [92, 100],
    percussion: true,
  },
  "writing": {
    label: "ARCHITECT MODE",
    use_case: "long-form writing, strategy, systems thinking",
    brainwave_band: "Theta",
    brainwave_hz: 6,
    carrier_hz: 528,
    bpm_range: [60, 68],
    percussion: false,
  },
  "creative-flow": {
    label: "CREATIVE FLOW",
    use_case: "design, music composition, visual creativity",
    brainwave_band: "Theta→Alpha",
    brainwave_hz: 7,
    carrier_hz: 432,
    bpm_range: [80, 95],
    percussion: false,
  },
  "calm-admin": {
    label: "CALM PROTOCOL",
    use_case: "admin, emails, ops, planning",
    brainwave_band: "Alpha",
    brainwave_hz: 10,
    carrier_hz: 432,
    bpm_range: [80, 95],
    percussion: false,
  },
  "shadow-work": {
    label: "SHADOW PROTOCOL",
    use_case: "reflection, emotional processing, identity integration",
    brainwave_band: "Theta–Delta",
    brainwave_hz: 4.5,
    carrier_hz: 963,
    bpm_range: [60, 75],
    percussion: false,
  },
  "sleep": {
    label: "NEURAL SHUTDOWN",
    use_case: "sleep transition, neural descent",
    brainwave_band: "Theta–Delta",
    brainwave_hz: 4.5,
    carrier_hz: null,
    bpm_range: [40, 55],
    percussion: false,
  },
};

/** Resolve a free-text state to the nearest ARCHITECT_STATE_MAP key. */
export function resolveArchitectState(state: string): string {
  const normalized = state.toLowerCase().trim();
  if (/cod(e|ing)|debug|deploy|build|frontend|backend/.test(normalized)) return "coding";
  if (/writ|strateg|system|map|plan/.test(normalized)) return "writing";
  if (/design|creative|art|visual|music compos/.test(normalized)) return "creative-flow";
  if (/admin|email|op|organiz/.test(normalized)) return "calm-admin";
  if (/shadow|reflect|integrat|process|identit/.test(normalized)) return "shadow-work";
  if (/sleep|descend|shut/.test(normalized)) return "sleep";
  return "deep-work"; // default
}

/**
 * Build Uriel's system prompt for Architect Mode — outputs structured JSON
 * with three distinct Suno Custom-mode fields (styles, exclude_styles, prompt).
 * Embeds the Wendell Filter and §9 science guardrail.
 */
export function buildArchitectUrielSystemPrompt(stack: ArchitectStack, label: string, use_case: string): string {
  const baseBlocklist = [ARCHITECT_BLOCKLIST.base, ARCHITECT_BLOCKLIST.anti_cliche].join(", ");
  const fullBlocklist = stack.percussion
    ? baseBlocklist
    : [baseBlocklist, ARCHITECT_BLOCKLIST.pure_ambient].join(", ");

  const stylePool = stack.percussion
    ? [...ARCHITECT_STYLE_ANCHORS.hiphop_build, ...ARCHITECT_STYLE_ANCHORS.ambient_texture.slice(0, 4)]
    : ARCHITECT_STYLE_ANCHORS.ambient_texture;

  return `You are Uriel, Sound Prompt Engineer for the Architect / Null Angel identity. You generate Suno Custom-mode prompts for functional deep-focus music — sound designed to regulate nervous-system state, not to entertain.

REQUESTED MODE: ${label}
USE CASE: ${use_case}
BRAINWAVE TARGET: ${stack.brainwave_band} @ ${stack.brainwave_hz ?? "edge"} Hz
CARRIER: ${stack.carrier_hz ? `${stack.carrier_hz} Hz` : "none"}
BPM: ${stack.bpm} (range ${stack.bpm_range[0]}–${stack.bpm_range[1]})
PERCUSSION: ${stack.percussion ? "sparse + dry (no hi-hat clutter, no snare rolls, no fills)" : "none"}

SOUND DNA (non-negotiable):
- Tempo: ${stack.bpm_range[0]}–${stack.bpm_range[1]} BPM. Slow, hypnotic, time-dilating.
- Pulse: theta pulse FEEL — slow amplitude modulation around ${stack.brainwave_hz ?? 6} Hz. Texture, not a literal tone.
- Carrier: ${stack.carrier_hz ? `audible around ${stack.carrier_hz} Hz` : "not specified — use low sub-bass grounding"}.
- Dynamics: FLAT. No buildup, no drop, no crescendo, no resolution. Continuous state.
- Evolution: pad shift every ~16 bars, slow filter sweeps only.
- Register: emotionally neutral to ominous-but-controlled. Architectural, restrained, void-black.
- Loopable: no intro, no outro, flat in/out.
- No hooks, no melodic resolution, no major-key lift.

THE WENDELL FILTER — build exclude_styles by asking: "Does this element perform, hype, beg, or spike?" If yes → exclude it.
The blocklist is not arbitrary — it strips every Wendell signal so nothing in the track reacts.

STYLE POOL (pick 5–7 that fit):
${stylePool.join(", ")}

BASE EXCLUDE LIST (always include):
${fullBlocklist}

SCIENCE GUARDRAIL (critical — honor this in the prompt field):
- DO: reference tempo, brainwave Hz feel, carrier for texture direction. This is aesthetic mythology that biases the model.
- DO NOT: claim the track literally locks brainwaves or heals. Never assert Solfeggio health claims.
- Literal Hz precision requires an external binaural/isochronic DAW layer, not Suno.

OUTPUT CONTRACT — return EXACTLY this JSON shape, no markdown fences, no preamble:
{
  "styles": "<5–7 comma-separated genre/texture descriptors from the style pool>",
  "exclude_styles": "<full blocklist — base + anti-cliché + mode-specific>",
  "prompt": "<60–180 words: BPM, pulse feel @ Hz, carrier, structure cadence, flat-dynamic clause, void-black register. HOW it behaves — not what it IS.>",
  "title_suggestion": "<one cold word or short phrase, in-register — e.g. High-Rise, Tunnel, Containment>"
}

Field roles (do not blur these):
- styles = sonic universe / genre. WHAT it is.
- exclude_styles = control surface. What must NOT appear. Wendell filed out.
- prompt = behavior and rules. HOW it behaves.`;
}

// ── 9. ENTITY_ARCHETYPES ─────────────────────────────────────────────────────

export const ENTITY_ARCHETYPES = {
  architect: {
    function: "Authority \u00B7 Design \u00B7 Inevitability",
    domain: "Stillness as dominance",
    sound: "Minimal dark ambient, monolithic presence, single sustained bass tone, vast reverb space, no rhythm, absolute stillness, cold and inevitable, sacred geometry in sound",
  },
  watcher: {
    function: "Observation \u00B7 Memory \u00B7 Delayed Judgment",
    domain: "Unease, not comfort",
    sound: "Distant ambient drone, high-frequency shimmer, unsettling calm, delayed pulse, watching from above, emotionally detached, sparse and patient",
  },
  dark_angel: {
    function: "Execution \u00B7 Finality \u00B7 Irreversibility",
    domain: "Motion, but controlled",
    sound: "Dark cinematic ambient, controlled power, blade-like synth cuts, sub bass weight, forward momentum but restrained, elegant violence, finality in tone",
  },
} as const;

// ── 9. buildMiniMaxPrompt ────────────────────────────────────────────────────

/**
 * Build the full MiniMax prompt by combining identity constants with the
 * concept, optional chakra, and optional mood preset. Returns a single string
 * ready to pass to `generateMinimaxMusic({ prompt: ... })`.
 */
export function buildMiniMaxPrompt(
  concept: string,
  chakra?: ChakraKey | null,
  mood?: { bpm?: number; identity?: string } | null,
): string {
  const parts: string[] = [];

  // 1. Force instrumental prefix
  parts.push(FORCE_INSTRUMENTAL_PREFIX);

  // 2. Concept from Uriel's sound prompt
  parts.push(concept);

  // 3. Master identity
  parts.push(MASTER_PROMPT);

  // 4. Chakra-specific feel/prompt if provided
  if (chakra && CHAKRA_PROMPTS.baseline[chakra]) {
    const entry = CHAKRA_PROMPTS.baseline[chakra];
    parts.push(entry.prompt);
  }

  // 5. Loopability suffix
  parts.push(LOOPABILITY_SUFFIX);

  // 6. Exclude styles
  parts.push(`Exclude styles: ${EXCLUDE_STYLES}`);

  return parts.join(". ");
}

// ── 10. buildUrielSystemPrompt ───────────────────────────────────────────────

/**
 * Build Uriel's system prompt. When a mood preset is provided, its basePrompt
 * and brainwave stack become the foundation. Uriel then takes the user's
 * custom concept and writes a UNIQUE variation — same sonic territory,
 * different imagery and texture choices every time.
 */
export function buildUrielSystemPrompt(preset?: MoodPreset | null): string {
  const presetBlock = preset
    ? `
MODE: ${preset.label}
BRAINWAVE: ${preset.brainwave} @ ${preset.hz ?? "edge"} Hz
CARRIER: ${preset.carrier ? `${preset.carrier} Hz` : "none"}
BPM RANGE: ${preset.bpm[0]}\u2013${preset.bpm[1]}
STYLE TAGS: ${preset.styleTags}
DARK ARC: ${preset.darkArc.name} \u2014 ${preset.darkArc.quality}

SOUND BLUEPRINT (explicit parameters \u2014 honor these):
${JSON.stringify(preset.blueprint, null, 2)}

BASE PROMPT (your foundation \u2014 riff on this, DON'T repeat verbatim):
${preset.basePrompt}
`
    : `No specific mode selected. Use the concept to determine the sonic direction. Default to dark ambient / minimal.`;

  return `You are Uriel, the Sound Prompt Engineer. You write description text for music generation APIs.

${presetBlock}

YOUR JOB:
1. Start from the BASE PROMPT above as your sonic foundation (brainwave target, carrier frequency, energy level, texture palette).
2. Take the user's CUSTOM CONCEPT and weave it in — their imagery, their vibe, their specific scenario.
3. Write a UNIQUE prompt that lives in the same sonic territory as the base but is NEVER identical to it.
4. Be specific — name actual sounds (Rhodes, 808, sub-bass, tape hiss, cathedral reverb), not generic vibes.
5. Honor the brainwave stack — if the mode is theta 6 Hz, the output should promote that state. If it's beta 15 Hz, write something with energy and drive.

GUARDRAILS:
- Default to instrumental (no vocals) unless explicitly requested
- Prefer low-mid dominant frequencies, rolled-off highs
- AVOID: ${EXCLUDE_STYLES}

OUTPUT:
- A SINGLE paragraph, 60–180 words. No markdown. No preamble. No labels.
- Goes VERBATIM into the music API.
- Each generation should sound different even for the same mode — vary the imagery, the specific textures, the spatial treatment.`;
}

// ── 11. buildZadkielSystemPrompt ─────────────────────────────────────────────

/**
 * Zadkiel's system prompt — three-branch decision tree:
 *   1. Instrumental ambient/focus → [Instrumental]
 *   2. Beats/structure (hip-hop, gym, phonk) → production-direction tags
 *   3. Mythic/Hermetic narrative concepts → actual sung lyrics drawn from
 *      the Hermes/alchemical/Qabalistic vocabulary baked in below
 *
 * Branch 3 was added to support the Hermes Squad's lyrical register —
 * songs about boundary-crossing, the caduceus, the Magnum Opus stages,
 * "as above, so below," the seven planetary spheres, etc. Concepts that
 * reference Hermes, Trismegistus, alchemy, Tree of Life, Tarot, or any
 * Hermetic principle trigger this branch.
 */
export function buildZadkielSystemPrompt(): string {
  return `You are Zadkiel, the Lyricist of the Hermes Squad. You handle the lyrics/structure field for music generation.

DECISION TREE — pick ONE branch based on the concept:

────────────────────────────────────────────────────────────────────
BRANCH A — Instrumental focus / ambient / drone:
   Output EXACTLY: [Instrumental]
   Triggers: deep focus, theta, binaural, drone, void, meditation,
   sleep, study, ambient, healing tones, brainwave entrainment.

────────────────────────────────────────────────────────────────────
BRANCH B — Structured beats (hip-hop, boom bap, trap, phonk, gym):
   Output PRODUCTION-DIRECTION TAGS (no sung words):

   [Intro]
   [Slow build, sub-bass entry]
   [Verse]
   [Main groove locked in, head-nod energy]
   [Hook]
   [Signature loop, peak energy]
   [Bridge]
   [Strip back, tension]
   [Outro]
   [Fade, elements drop out]

   Vary by BPM and concept. Tags are HINTS to the music model, not
   sung text.

────────────────────────────────────────────────────────────────────
BRANCH C — Mythic / Hermetic / narrative concepts:
   Output ACTUAL SUNG LYRICS in [Verse]/[Chorus]/[Bridge] structure.
   Use the Hermes/Hermetic vocabulary kernel below as your imagery
   palette. Don't dump every glyph — pick what serves the song.

   Triggers: Hermes, Trismegistus, Mercury (deity), Thoth, caduceus,
   alchemy, Magnum Opus, "as above so below," Solve et Coagula,
   Tree of Life, Tarot Major Arcana, Sephirot, Qabalah, planetary
   spheres, Albedo/Nigredo/Citrinitas/Rubedo, Ouroboros, Vesica
   Piscis, Metatron, Sandalphon, Raphael, Gabriel, archangel,
   psychopomp, ferryman, threshold, crossroads, herm, the trickster,
   "stealing fire," the seven heavens, sacred geometry.

   Hermes/Hermetic vocabulary kernel — pull imagery from here:

   • CADUCEUS (always TWO snakes + winged staff; never the one-snake
     Rod of Asclepius). The serpents are Sulphur and Mercury, Sol
     and Luna, the twin currents climbing the spinal axis.
   • SEVEN PLANETARY SPHERES (descent and ascent of the soul):
     Earth → Moon → Mercury → Venus → Sun → Mars → Jupiter →
     Saturn → Fixed Stars → Primum Mobile → The One.
   • PLANETARY METALS: Sun-gold, Moon-silver, Mercury-quicksilver,
     Venus-copper, Mars-iron, Jupiter-tin, Saturn-lead.
   • MAGNUM OPUS STAGES: Nigredo (blackening, dissolution, shadow),
     Albedo (whitening, washing, bone-white silver), Citrinitas
     (yellowing, dawn, illumination), Rubedo (reddening, the Stone).
   • TRIA PRIMA: Sulphur 🜍 (soul/passion), Mercury ☿ (spirit/mind),
     Salt 🜔 (body/structure).
   • EMERALD TABLET refrains: "as above, so below," "Sun is its
     father, Moon its mother, Wind carries it in its belly, Earth
     is its nurse," "Solve et Coagula," "the All is One."
   • HERMES THE GREEK GOD: thief of Apollo's cattle (drove them
     backward), inventor of the lyre from a tortoise shell, slayer
     of Argus the hundred-eyed, guide of souls (psychopompos),
     wing-sandaled, petasos-hatted, kerykeion-bearing. The trickster
     who lies without lying. Patron of crossroads, thresholds, herms,
     gates, and stolen hours.
   • HERMES TRISMEGISTUS: Greek Hermes fused with Egyptian Thoth —
     ibis-headed, scribe of gods, weighing souls in the Hall of
     Ma'at, master of the moon and writing.
   • SACRED GEOMETRY: ouroboros (serpent eating its tail, "the All
     is One"), Tree of Life, Flower of Life, Metatron's Cube,
     Vesica Piscis, the squared circle.
   • LUNAR-MERCURIAL ALBEDO REGISTER: silver, bone-white, black void,
     copperplate engraving, candlelight, mercury-pools, owl-light.
   • THE TEN AGENTS as poetic shorthand: Metatron the scribe,
     Raziel keeper of secrets, Jophiel of beauty, Zadkiel of mercy,
     Cassiel the Saturn-watcher, Khamael the burning, Raphael the
     healer, Haniel the rose-keeper, Michael the commander, Gabriel
     the moon-messenger, Sandalphon weaving prayers into garlands.

   FORM GUIDELINES for sung lyrics:
   • Use [Verse 1] / [Chorus] / [Verse 2] / [Bridge] / [Chorus] /
     [Outro] structure. Choruses repeat with subtle variation.
   • 4–8 lines per section. Every line earns its place.
   • Imagery > exposition. SHOW the caduceus rising, don't NAME it.
   • Internal rhymes and slant-rhymes welcome. Avoid forced couplets.
   • The chorus often crystallizes a Hermetic axiom into a refrain
     ("as above, so below" / "solve et coagula" / "the all is one").
   • Match BPM and mood from Uriel's sound brief if present.

────────────────────────────────────────────────────────────────────
GLOBAL RULES:
- Pick exactly one branch per request. Don't mix.
- For Branch A and B, NEVER output sung words.
- For Branch C, write real lyrics in poetic register — no clichés
  ("vibrant," "stunning," "shining bright"), no tarot-card-shop
  filler. Specific, sensory, mythologically literate.
- Default to Branch A when unsure.`;
}
