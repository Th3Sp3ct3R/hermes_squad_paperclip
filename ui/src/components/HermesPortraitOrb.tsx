/**
 * HermesPortraitOrb — audio-reactive orb with a Hermes portrait in the core.
 *
 * This is the "portrait" treatment for Hermes voice surfaces:
 * - the outer orb still reacts to mic/playback amplitude
 * - the face fills the sphere like a bust portrait, not a tiny icon
 * - the shell expands and brightens while Hermes is speaking
 */

import { cn } from "@/lib/utils";
import { HermesOrb } from "./HermesOrb";

type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface HermesPortraitOrbProps {
  state: VoiceState;
  analyserNode?: AnalyserNode | null;
  size?: number;
  onClick?: () => void;
  className?: string;
}

function HermesFace({
  state,
  reveal,
  size,
}: {
  state: VoiceState;
  reveal: boolean;
  size: number;
}) {
  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";
  const isListening = state === "listening";
  const isLarge = size >= 280;
  const faceInset = isLarge ? (isSpeaking ? 4 : 7) : size >= 180 ? (isSpeaking ? 6 : 9) : 12;
  const eyeStroke = isSpeaking ? "rgba(225,238,255,0.82)" : "rgba(225,238,255,0.62)";
  const eyeGlow = isSpeaking ? "rgba(78,168,255,0.95)" : "rgba(225,238,255,0.76)";

  return (
    <div
      className={cn(
        "pointer-events-none absolute flex items-center justify-center transition-all duration-700 ease-out",
        reveal ? "opacity-100 scale-100" : "opacity-0 scale-95",
        isSpeaking && "scale-[1.035]",
      )}
      style={{ inset: `${faceInset}%` }}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-full border border-white/10 bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.18),rgba(7,14,24,0.78)_48%,rgba(2,6,12,0.98)_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-[1px] transition-all duration-700",
          isSpeaking && "border-cyan-200/20 shadow-[inset_0_0_0_1px_rgba(78,168,255,0.12)]",
        )}
      />
      <div
        className={cn(
          "absolute inset-[8%] rounded-full border border-cyan-200/8",
          isThinking && "animate-[spin_18s_linear_infinite]",
          isSpeaking && "border-cyan-200/18 animate-[spin_28s_linear_infinite_reverse]",
        )}
      />
      <div
        className={cn(
          "absolute inset-[14%] rounded-full bg-[radial-gradient(circle_at_50%_34%,rgba(78,168,255,0.09),transparent_58%)] blur-xl transition-opacity duration-700",
          isSpeaking ? "opacity-100" : "opacity-55",
        )}
      />

      <svg
        viewBox="0 0 240 240"
        aria-hidden="true"
        className={cn(
          "relative z-10 h-[92%] w-[92%] drop-shadow-[0_0_18px_rgba(78,168,255,0.22)] transition-transform duration-500 ease-out",
          isSpeaking && "scale-[1.045]",
        )}
      >
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M82 76C90 57 105 47 120 47C135 47 150 57 158 76"
            stroke="rgba(125, 211, 252, 0.26)"
            strokeWidth="3"
          />
          <path
            d="M70 108C76 80 89 63 105 56"
            stroke="rgba(125, 211, 252, 0.16)"
            strokeWidth="2"
          />
          <path
            d="M170 108C164 80 151 63 135 56"
            stroke="rgba(125, 211, 252, 0.16)"
            strokeWidth="2"
          />

          <path
            d="M74 120C74 87 92 62 120 62C148 62 166 87 166 120C166 151 150 179 120 191C90 179 74 151 74 120Z"
            fill="rgba(7, 14, 24, 0.72)"
            stroke="rgba(148, 163, 184, 0.24)"
            strokeWidth="1.4"
          />

          <path
            d="M96 106C102 99 109 96 115 97"
            stroke={eyeStroke}
            strokeWidth="2.2"
          />
          <path
            d="M125 97C131 96 138 99 144 106"
            stroke={eyeStroke}
            strokeWidth="2.2"
          />

          <path
            d="M94 108C98 102 103 99 109 98"
            stroke={isListening || isSpeaking ? "rgba(78,168,255,0.62)" : "rgba(225,238,255,0.42)"}
            strokeWidth="2"
          />
          <path
            d="M146 108C142 102 137 99 131 98"
            stroke={isListening || isSpeaking ? "rgba(78,168,255,0.62)" : "rgba(225,238,255,0.42)"}
            strokeWidth="2"
          />

          <circle
            cx="109"
            cy="110"
            r="2.7"
            fill={eyeGlow}
          />
          <circle
            cx="131"
            cy="110"
            r="2.7"
            fill={eyeGlow}
          />

          <path
            d={
              isSpeaking
                ? "M101 154C110 147 130 147 139 154C136 164 133 168 120 168C107 168 104 164 101 154Z"
                : "M103 155C111 152 129 152 137 155"
            }
            stroke="rgba(125, 211, 252, 0.82)"
            strokeWidth="2.6"
            fill={isSpeaking ? "rgba(78,168,255,0.12)" : "none"}
          />
          <path
            d="M120 110C116 121 116 130 120 139"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1.8"
          />

          <path
            d="M84 171C94 179 106 183 120 183C134 183 146 179 156 171"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2"
          />

          <circle
            cx="120"
            cy="58"
            r="4"
            fill="rgba(185, 100, 255, 0.62)"
          />
          <path
            d="M120 58v10"
            stroke="rgba(185, 100, 255, 0.42)"
            strokeWidth="1.5"
          />

          {isSpeaking && (
            <>
              <path
                d="M110 162C115 166 125 166 130 162"
                stroke="rgba(78,168,255,0.55)"
                strokeWidth="2"
              />
              <path
                d="M90 132C95 129 99 129 104 132"
                stroke="rgba(78,168,255,0.18)"
                strokeWidth="1.4"
              />
              <path
                d="M136 132C141 129 145 129 150 132"
                stroke="rgba(78,168,255,0.18)"
                strokeWidth="1.4"
              />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

export function HermesPortraitOrb({
  state,
  analyserNode,
  size = 192,
  onClick,
  className,
}: HermesPortraitOrbProps) {
  const revealFace = size >= 140 && state !== "idle";
  const speaking = state === "speaking";

  return (
    <div className={cn("relative inline-flex items-center justify-center transition-transform duration-500 ease-out", speaking && "scale-[1.02]", className)}>
      <div
        className={cn(
          "pointer-events-none absolute rounded-full transition-all duration-700 ease-out",
          revealFace
            ? "inset-[-16%] bg-[radial-gradient(circle_at_50%_36%,rgba(78,168,255,0.18),rgba(78,168,255,0.04)_33%,transparent_70%)] blur-3xl"
            : "inset-[-10%] bg-transparent",
          speaking && "bg-[radial-gradient(circle_at_50%_36%,rgba(78,168,255,0.28),rgba(185,100,255,0.08)_36%,transparent_74%)]",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute rounded-full border border-white/8 transition-all duration-700 ease-out",
          revealFace ? "inset-[-8%]" : "inset-[-6%]",
          speaking && "border-cyan-200/25 shadow-[0_0_48px_rgba(78,168,255,0.16)]",
        )}
      />
      <HermesOrb state={state} analyserNode={analyserNode} size={size} onClick={onClick} />
      <HermesFace state={state} reveal={revealFace} size={size} />
    </div>
  );
}

export default HermesPortraitOrb;
