/**
 * HermesConductor — the Trickster-Sage avatar sits above the archangels.
 *
 * A compact chat interface where you tell Hermes what you want and he
 * orchestrates the pipeline: creates songs, invokes presets, dispatches
 * auto-runs. Replaces the static "Begin Opus" / "Invoke the Spheres" buttons
 * with a conversational flow while keeping them accessible as fallback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { sunoPipelineApi, SUNO_CHAKRA_FREQUENCIES } from "@/api/sunoPipeline";
import type { SunoChakra } from "@/api/sunoPipeline";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/context/ToastContext";
import { HermesPortraitOrb } from "./HermesPortraitOrb";
import { ScrollText, Sparkles, Send, ChevronUp, ChevronDown } from "lucide-react";

// ── SunoChakra labels for display ──
const CHAKRA_LABELS: Record<string, string> = {
  ROOT: "Root",
  SACRAL: "Sacral",
  SOLAR: "Solar Plexus",
  HEART: "Heart",
  THIRD_EYE: "Third Eye",
  CROWN: "Crown",
};

// ── Quick presets that Hermes suggests ──
const QUICK_PRESETS = [
  { id: "deep-coding", label: "Deep Coding", chakra: "THIRD_EYE", emoji: "\u{1F5A5}" },
  { id: "creative-flow", label: "Creative Flow", chakra: "HEART", emoji: "\u{1F3A8}" },
  { id: "night-drive", label: "Night Drive", chakra: "SACRAL", emoji: "\u{1F319}" },
  { id: "shadow-work", label: "Shadow Work", chakra: "ROOT", emoji: "\u{1F52E}" },
  { id: "gym-run", label: "Gym / Run", chakra: "ROOT", emoji: "\u{1F4AA}" },
  { id: "pre-sleep", label: "Pre-Sleep", chakra: "CROWN", emoji: "\u{1F311}" },
];

// ── Preset concept map (from pipeline presets) ──
const PRESET_CONCEPTS: Record<string, { concept: string; genre: string }> = {
  "deep-coding": {
    concept: "3am server room, one dim monitor, hypnotic repetitive minimal. Dark sub-bass pulse, sparse kick, no hooks, flat energy. Loop forever.",
    genre: "dark minimalist hip-hop, ambient trap, lo-fi industrial",
  },
  "night-drive": {
    concept: "Driving through an empty city at 2am with tinted windows. Deep 808 slides, haunted piano loop, sparse hi-hats, menacing but controlled.",
    genre: "dark trap, phonk, memphis rap instrumental, cinematic hip-hop",
  },
  "creative-flow": {
    concept: "Golden hour through a dusty window. Warm Rhodes, soft brushed snare, subtle bass groove, tape hiss. Calm confidence, unhurried mastery.",
    genre: "lo-fi hip-hop, ambient jazz, chill instrumental, warm analog",
  },
  "shadow-work": {
    concept: "Controlled descent, sinking into warm black water. One evolving dark pad with slow amplitude modulation at 6 cycles per second. No resolution.",
    genre: "dark ambient, drone, ethereal bass music, witch house",
  },
  "gym-run": {
    concept: "Controlled rage, not reckless anger. A machine, not an animal. Distorted 808 kicks, industrial metallic textures, relentless forward momentum.",
    genre: "dark industrial hip-hop, aggressive trap, grime instrumental, phonk",
  },
  "morning-walk": {
    concept: "A man walking through cold air with purpose. Crisp drums, vinyl crackle, a lone sample floating over a steady head-nod groove.",
    genre: "boom bap, instrumental hip-hop, golden era beats, dusty samples",
  },
  "wind-down": {
    concept: "Cooking something good alone in a clean kitchen with low lighting. Warm bass, muted trumpet sample, gentle vinyl crackle.",
    genre: "lo-fi hip-hop, chillhop, smooth jazz beats, ambient R&B instrumental",
  },
  "pre-sleep": {
    concept: "Ultra-minimal ambient soundscape designed for late-night listening. No tempo, no structure, just atmospheric drift.",
    genre: "dark ambient, drone, sleep music, deep space, minimal electronic",
  },
  "sleep": {
    concept: "Ultra-minimalist dark ambient soundscape designed for neural shutdown. Sub-audible drone at theta frequency, no harmonic movement.",
    genre: "dark ambient, drone, sleep music, deep space",
  },
};

interface ChatMessage {
  id: string;
  role: "user" | "hermes";
  text: string;
  timestamp: Date;
}

interface HermesConductorProps {
  companyId: string;
  musicBackend: "minimax" | "suno";
  /** Called when a song is created and auto-run */
  onSongCreated?: () => void;
  onClose?: () => void;
}

export function HermesConductor({ companyId, musicBackend, onSongCreated, onClose }: HermesConductorProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "hermes",
      text: "I'm Hermes. Tell me what music to create — a mood, a scene, a vibe. I'll handle the rest.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [minimized, setMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount and when expanded
  useEffect(() => {
    if (!minimized) inputRef.current?.focus();
  }, [minimized]);

  const addMessage = useCallback((role: "user" | "hermes", text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role, text, timestamp: new Date() },
    ]);
  }, []);

  /** Speak Hermes' response aloud using browser TTS */
  const speakResponse = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Cancel any in-progress speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.9;
    // Prefer a deep/smooth English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes("Daniel")) ||
      voices.find(v => v.name.includes("Alex")) ||
      voices.find(v => v.lang.startsWith("en") && v.name.includes("Male")) ||
      voices.find(v => v.lang.startsWith("en"));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    window.speechSynthesis.speak(utterance);
  }, []);

  /** Add Hermes message and speak it */
  const hermesRespond = useCallback((text: string) => {
    hermesRespond( text);
    speakResponse(text);
  }, [addMessage, speakResponse]);

  const createSong = useCallback(async (presetId: string): Promise<{ id: string; chakra: string; hz: number; genre: string; concept: string } | false> => {
    const preset = PRESET_CONCEPTS[presetId];
    if (!preset) return false;
    const chakra = (Object.keys(CHAKRA_LABELS).find(
      (k) => QUICK_PRESETS.find((p) => p.id === presetId)?.chakra === k
    ) || "HEART") as SunoChakra;
    const hz = SUNO_CHAKRA_FREQUENCIES[chakra] ?? 528;
    try {
      const issue = await sunoPipelineApi.create(companyId, {
        concept: preset.concept,
        targetChakra: chakra,
        genre: preset.genre,
      });
      await sunoPipelineApi.autoRun(issue.id, companyId, { musicBackend });
      queryClient.invalidateQueries({ queryKey: ["suno-pipeline", companyId] });
      onSongCreated?.();
      return { id: issue.id.slice(0, 8), chakra, hz, genre: preset.genre, concept: preset.concept.slice(0, 80) };
    } catch (err) {
      pushToast({ tone: "error", title: "Failed to create song", body: String(err) });
      return false;
    }
  }, [companyId, musicBackend, queryClient, pushToast, onSongCreated]);

  // Format song details for Hermes response
  const formatSongDetails = (result: { id: string; chakra: string; hz: number; genre: string; concept: string }) => {
    const chakraLabel = CHAKRA_LABELS[result.chakra] || result.chakra;
    return `\n\n[ ♪ ${result.id} ]\n${result.concept}\n${chakraLabel} · ${result.hz} Hz · ${result.genre}`;
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    addMessage("user", text);

    // Check if this is a command we handle directly
    const lower = text.toLowerCase();

    // Detect preset requests
    for (const [id, preset] of Object.entries(PRESET_CONCEPTS)) {
      const label = id.replace(/-/g, " ");
      if (lower.includes(id) || lower.includes(label) || (lower.includes("deep") && lower.includes("coding") && id === "deep-coding")) {
        setVoiceState("thinking");
        const result = await createSong(id);
        setVoiceState(result ? "speaking" : "idle");
        hermesRespond( result
          ? `On it.${formatSongDetails(result as { id: string; chakra: string; hz: number; genre: string; concept: string })}`
          : `I tried but couldn't create that one. Check the pipeline status and try again.`);
        setTimeout(() => setVoiceState("idle"), 2000);
        return;
      }
    }

    // Detect "invoke the spheres" / "all presets"
    if (lower.includes("invoke") || lower.includes("all") || lower.includes("everything") || lower.includes("batch")) {
      setVoiceState("thinking");
      const presets = Object.keys(PRESET_CONCEPTS);
      let succeeded = 0;
      for (const p of presets) {
        const ok = await createSong(p);
        if (ok) succeeded++;
        await new Promise((r) => setTimeout(r, 500));
      }
      setVoiceState("speaking");
      hermesRespond( `I've invoked ${succeeded} of ${presets.length} presets into the pipeline. Check the kanban — they'll arrive as they complete.`);
      setTimeout(() => setVoiceState("idle"), 3000);
      return;
    }

    // Detect custom concept — broad patterns:
    //   "i want a hip hop focus song"
    //   "create a rainy night track"
    //   "make me something dark"
    //   "a song about coding at 3am"
    //   "hip hop coding focus"
    const conceptMatch =
      lower.match(/(?:i want|create|make|write|generate)\s+(?:a|an|me|us|)\s*(.+?)(?:song|track|beat|instrumental)?$/i) ||
      lower.match(/^(.+?)(?:song|track|instrumental|music)(?:\s+for|\s+about)?\s+(.+)/i);
    // Only create a song when intent is clearly about music — not general conversation
    const hasMusicKeyword = /\b(song|track|beat|instrumental|music|drone|ambient|loop|vibe|produce|mix)\b/i.test(lower);
    const shouldCreateSong = conceptMatch || (hasMusicKeyword && lower.length > 10);
    if (shouldCreateSong) {
      // Build concept from match or use the raw input cleaned up
      let concept = "";
      if (conceptMatch && conceptMatch[1]) {
        concept = (conceptMatch[1] + (conceptMatch[2] ? " " + conceptMatch[2] : "")).trim();
      } else {
        // Clean up: remove leading noise like "i want" / "make me" / "a"
        concept = lower
          .replace(/^(?:i want|i'd like|make|create|generate|write)\s+(?:a|an|me|us|some|)\s*/i, '')
          .replace(/\s+(?:song|track|beat|instrumental|music)$/i, '')
          .trim()
          .slice(0, 200);
      }
      if (!concept || concept.length < 3) concept = lower.slice(0, 200);

      setVoiceState("thinking");
      try {
        const issue = await sunoPipelineApi.create(companyId, {
          concept,
          targetChakra: lower.includes("focus") || lower.includes("code") || lower.includes("deep") || lower.includes("study") ? "THIRD_EYE" :
                          lower.includes("sleep") || lower.includes("night") || lower.includes("moon") ? "CROWN" :
                          lower.includes("dark") || lower.includes("shadow") || lower.includes("gym") || lower.includes("heavy") ? "ROOT" :
                          lower.includes("hip hop") || lower.includes("rap") || lower.includes("trap") || lower.includes("groove") ? "SACRAL" :
                          lower.includes("calm") || lower.includes("warm") || lower.includes("sun") || lower.includes("morning") ? "SOLAR" :
                          "HEART",
        });
        await sunoPipelineApi.autoRun(issue.id, companyId, { musicBackend });
        setVoiceState("speaking");
        const chakra = lower.includes("focus") || lower.includes("code") || lower.includes("deep") || lower.includes("study") ? "THIRD_EYE" :
                        lower.includes("sleep") || lower.includes("night") || lower.includes("moon") ? "CROWN" :
                        lower.includes("dark") || lower.includes("shadow") || lower.includes("gym") || lower.includes("heavy") ? "ROOT" :
                        lower.includes("hip hop") || lower.includes("rap") || lower.includes("trap") || lower.includes("groove") ? "SACRAL" :
                        lower.includes("calm") || lower.includes("warm") || lower.includes("sun") || lower.includes("morning") ? "SOLAR" :
                        "HEART";
        const hz = SUNO_CHAKRA_FREQUENCIES[chakra as SunoChakra] ?? 528;
        const label = CHAKRA_LABELS[chakra] || chakra;
        hermesRespond( `I've dispatched your working to the council.\n\n[ ♪ ${issue.id.slice(0, 8)} ] ${concept.slice(0, 80)}\n${label} · ${hz} Hz`);
      } catch (err) {
        setVoiceState("idle");
        hermesRespond( "Sorry, I couldn't create that one. The gate seemed blocked.");
      }
      setTimeout(() => setVoiceState("idle"), 2000);
      queryClient.invalidateQueries({ queryKey: ["suno-pipeline", companyId] });
      onSongCreated?.();
      return;
    }

    // Fall back to Hermes chat API for conversation
    setVoiceState("thinking");
    try {
      const res = await fetch("/api/hermes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setVoiceState("speaking");
      hermesRespond( data.response || "I'm listening. What do you need?");
    } catch {
      setVoiceState("idle");
      hermesRespond( "The oracle is silent. Try again in a moment.");
    }
    setTimeout(() => setVoiceState("idle"), 2000);
  }, [input, loading, companyId, musicBackend, addMessage, createSong, queryClient, pushToast, onSongCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border transition-all duration-300",
        "bg-gradient-to-b from-black/60 to-black/80 backdrop-blur-sm",
        minimized ? "border-cyan-900/30" : "border-cyan-800/40 shadow-lg shadow-cyan-900/10",
      )}
    >
      {/* ── Header: Hermes avatar + title + minimize toggle ── */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none",
          !minimized && "border-b border-cyan-800/20",
        )}
        onClick={() => setMinimized(!minimized)}
      >
        {/* Hermes portrait orb — small */}
        <div className="shrink-0">
          <HermesPortraitOrb
            state={voiceState === "speaking" ? "speaking" : voiceState === "thinking" ? "thinking" : "idle"}
            size={48}
            alwaysShowFace
          />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold tracking-tight"
            style={{
              color: "#FFFFFF",
              textShadow: "0 0 6px rgba(255,255,255,0.3)",
            }}
          >
            Hermes
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            {voiceState === "thinking" ? "Thinking..." : voiceState === "speaking" ? "Speaking" : "Trickster-Sage Conductor"}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
            className="p-1 rounded-md hover:bg-white/10 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {minimized ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* ── Chat body (collapsible) ── */}
      {!minimized && (
        <div className="p-3 space-y-3">
          {/* Messages */}
          <div className="space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "px-3 py-1.5 rounded-2xl text-[12px] leading-relaxed max-w-[85%]",
                    msg.role === "user"
                      ? "bg-cyan-900/30 text-cyan-100 border border-cyan-700/30"
                      : "bg-white/5 text-white/80 border border-white/10",
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick preset chips */}
          <div className="flex gap-1.5 flex-wrap">
            {QUICK_PRESETS.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={loading}
                onClick={async () => {
                  setInput("");
                  addMessage("user", `Create a ${preset.label.toLowerCase()} track`);
                  setVoiceState("thinking");
                  const result = await createSong(preset.id);
                  setVoiceState(result ? "speaking" : "idle");
                  hermesRespond( result
                    ? `On it.${formatSongDetails(result as { id: string; chakra: string; hz: number; genre: string; concept: string })}`
                    : `Failed to create ${preset.label}.`);
                  setTimeout(() => setVoiceState("idle"), 2000);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-cyan-800/30 bg-cyan-950/30 text-cyan-200/70 hover:bg-cyan-900/40 hover:text-cyan-100 transition-colors whitespace-nowrap"
              >
                <span>{preset.emoji}</span>
                <span>{preset.label}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                addMessage("user", "Invoke the spheres — all presets");
                setVoiceState("thinking");
                const presets = Object.keys(PRESET_CONCEPTS);
                let succeeded = 0;
                let details = "";
                for (const p of presets) {
                  const result = await createSong(p);
                  if (result) { succeeded++; details += formatSongDetails(result); }
                  await new Promise((r) => setTimeout(r, 500));
                }
                setVoiceState("speaking");
                hermesRespond( `${succeeded} of ${presets.length} presets dispatched:${details}`);
                setTimeout(() => setVoiceState("idle"), 3000);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border border-amber-700/30 bg-amber-950/30 text-amber-200/70 hover:bg-amber-900/40 hover:text-amber-100 transition-colors whitespace-nowrap"
            >
              <Sparkles className="h-3 w-3" />
              <span>Invoke All</span>
            </button>
          </div>

          {/* Input */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell Hermes what music to make..."
              disabled={loading}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-cyan-700/30 border border-cyan-600/30 text-cyan-200/70 hover:bg-cyan-600/40 hover:text-cyan-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Hint */}
          <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
            <span className="text-cyan-400/60">"deep coding track"</span>
            {" · "}
            <span className="text-cyan-400/60">"invoke the spheres"</span>
            {" · "}
            <span className="text-cyan-400/60">"night drive song"</span>
            {" · or describe any scene"}
          </p>
        </div>
      )}
    </div>
  );
}