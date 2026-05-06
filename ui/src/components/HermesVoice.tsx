/**
 * HermesVoice — the voice orb UI.
 *
 * A floating orb that serves as the interface to Hermes' voice agent.
 * States: idle → listening → thinking → speaking (with interrupt support).
 *
 * Visual language follows the Hermetic/alchemical aesthetic:
 * - Idle: Silver orb, subtle pulse
 * - Listening: Expanded, amplitude visualization
 * - Thinking: Rotating shimmer
 * - Speaking: Color shift (albedo → citrinitas), amplitude-driven
 */

import { useState } from "react";
import { useHermesVoice, type VoiceState } from "../hooks/useHermesVoice";

interface HermesVoiceProps {
  /** Position style */
  className?: string;
  /** Voice preset */
  preset?: "narration" | "status" | "psychopomp" | "trickster";
}

export function HermesVoice({ className = "", preset = "narration" }: HermesVoiceProps) {
  const [transcript, setTranscript] = useState<string[]>([]);

  const {
    state,
    isConnected,
    lastTranscription,
    lastResponse,
    startListening,
    disconnect,
  } = useHermesVoice({
    preset,
    onTranscription: (text) => {
      setTranscript((prev) => [...prev.slice(-4), `You: ${text}`]);
    },
    onResponse: (text) => {
      setTranscript((prev) => [...prev.slice(-4), `Hermes: ${text}`]);
    },
    onError: (err) => {
      console.error("[HermesVoice]", err);
    },
  });

  const handleClick = () => {
    if (state === "idle") {
      startListening();
    } else {
      disconnect();
    }
  };

  return (
    <div className={`hermes-voice ${className}`}>
      {/* Orb button */}
      <button
        onClick={handleClick}
        className={`hermes-orb hermes-orb--${state}`}
        aria-label={state === "idle" ? "Start voice conversation" : "End conversation"}
        title={state === "idle" ? "Speak with Hermes" : `${stateLabel(state)} — click to end`}
      >
        <div className="hermes-orb__glow" />
        <div className="hermes-orb__core">
          {state === "idle" && <MicIcon />}
          {state === "connecting" && <PulseIcon />}
          {state === "listening" && <WaveIcon />}
          {state === "thinking" && <ThinkIcon />}
          {state === "speaking" && <SpeakIcon />}
        </div>
        {state !== "idle" && (
          <span className="hermes-orb__label">{stateLabel(state)}</span>
        )}
      </button>

      {/* Transcript overlay */}
      {isConnected && transcript.length > 0 && (
        <div className="hermes-transcript">
          {transcript.map((line, i) => (
            <p key={i} className={line.startsWith("Hermes:") ? "hermes-line" : "user-line"}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── State labels ────────────────────────────────────────────

function stateLabel(state: VoiceState): string {
  switch (state) {
    case "idle": return "";
    case "connecting": return "Connecting...";
    case "listening": return "Listening";
    case "thinking": return "Thinking";
    case "speaking": return "Speaking";
  }
}

// ─── Icons (inline SVG) ─────────────────────────────────────

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="hermes-icon">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="hermes-icon hermes-icon--pulse">
      <circle cx="12" cy="12" r="4" opacity="0.6" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="hermes-icon hermes-icon--wave">
      <line x1="4" y1="12" x2="4" y2="12" className="wave-bar" />
      <line x1="8" y1="8" x2="8" y2="16" className="wave-bar" />
      <line x1="12" y1="5" x2="12" y2="19" className="wave-bar" />
      <line x1="16" y1="8" x2="16" y2="16" className="wave-bar" />
      <line x1="20" y1="12" x2="20" y2="12" className="wave-bar" />
    </svg>
  );
}

function ThinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="hermes-icon hermes-icon--spin">
      <circle cx="12" cy="12" r="9" strokeDasharray="20 10" />
    </svg>
  );
}

function SpeakIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="hermes-icon hermes-icon--speak">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export default HermesVoice;
