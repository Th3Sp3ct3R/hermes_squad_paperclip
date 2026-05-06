/**
 * HermesOrb — Canvas2D audio-reactive orb for the Hermes voice agent.
 *
 * Rendering layers (back → front):
 *   1. Outer glow — radial gradient, color keyed to state, radius pulses with amplitude
 *   2. Ring — circular stroke, rotates during `thinking`, radius oscillates with audio
 *   3. Core sphere — radial gradient with organic deformation via bezierCurveTo
 *   4. Inner element — waveform bars (active) or Mercury glyph (idle)
 *
 * State → visual:
 *   idle       → dim white, slow breathing
 *   connecting → faint purple, pulsing
 *   listening  → blue glow, surface deforms with mic FFT
 *   thinking   → purple glow, ring spins fast
 *   speaking   → bright blue, surface deforms with playback FFT
 */

import { useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface HermesOrbProps {
  state: VoiceState;
  analyserNode?: AnalyserNode | null;
  size?: number;
  onClick?: () => void;
}

// ─────────────────────────────────────────────────────────────
// Color config per state
// ─────────────────────────────────────────────────────────────

interface StateVisuals {
  coreColor: string;
  glowColor: string;
  ringColor: string;
  ringAlpha: number;
  ringSpeed: number; // rad/s — 0 = static
  breathe: boolean;
}

const STATE_VISUALS: Record<VoiceState, StateVisuals> = {
  idle: {
    coreColor: "rgba(255,255,255,0.06)",
    glowColor: "rgba(255,255,255,0.03)",
    ringColor: "rgba(255,255,255,0.08)",
    ringAlpha: 0.08,
    ringSpeed: 0,
    breathe: true,
  },
  connecting: {
    coreColor: "rgba(185,100,255,0.12)",
    glowColor: "rgba(185,100,255,0.06)",
    ringColor: "rgba(185,100,255,0.2)",
    ringAlpha: 0.2,
    ringSpeed: 1.5,
    breathe: true,
  },
  listening: {
    coreColor: "rgba(78,168,255,0.25)",
    glowColor: "rgba(78,168,255,0.12)",
    ringColor: "rgba(78,168,255,0.35)",
    ringAlpha: 0.35,
    ringSpeed: 0,
    breathe: false,
  },
  thinking: {
    coreColor: "rgba(185,100,255,0.25)",
    glowColor: "rgba(185,100,255,0.1)",
    ringColor: "rgba(185,100,255,0.4)",
    ringAlpha: 0.4,
    ringSpeed: 12, // fast spin
    breathe: false,
  },
  speaking: {
    coreColor: "rgba(78,168,255,0.35)",
    glowColor: "rgba(78,168,255,0.15)",
    ringColor: "rgba(78,168,255,0.45)",
    ringAlpha: 0.45,
    ringSpeed: 0,
    breathe: false,
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const NUM_POINTS = 12; // radial control points for organic deformation
const TWO_PI = Math.PI * 2;

/** Smooth lerp for transitions between states. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Extract average amplitude from FFT data, returns 0..1. */
function getAmplitude(analyser: AnalyserNode | null | undefined, data: Uint8Array | null): number {
  if (!analyser || !data) return 0;
  analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  return sum / data.length / 255;
}

/** Extract per-bin frequency data normalized to 0..1 array. */
function getFreqBins(analyser: AnalyserNode | null | undefined, data: Uint8Array | null, count: number): number[] {
  if (!analyser || !data) return new Array(count).fill(0);
  analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
  const bins: number[] = [];
  const step = Math.floor(data.length / count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += data[i * step + j]! || 0;
    }
    bins.push(sum / step / 255);
  }
  return bins;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function HermesOrb({ state, analyserNode, size = 192, onClick }: HermesOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const fftDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const startTimeRef = useRef(performance.now());
  const smoothAmpRef = useRef(0);
  const ringAngleRef = useRef(0);

  // Keep refs current for the animation loop closure
  const stateRef = useRef(state);
  const analyserRef = useRef(analyserNode);
  stateRef.current = state;
  analyserRef.current = analyserNode;

  // Init FFT buffer when analyser changes
  useEffect(() => {
    if (analyserNode) {
      fftDataRef.current = new Uint8Array(analyserNode.frequencyBinCount);
    } else {
      fftDataRef.current = null;
    }
  }, [analyserNode]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;
    const t = (performance.now() - startTimeRef.current) / 1000;
    const dt = 1 / 60; // approx

    const currentState = stateRef.current;
    const vis = STATE_VISUALS[currentState];

    // ── Get audio data ──
    const rawAmp = getAmplitude(analyserRef.current, fftDataRef.current);
    // Smooth amplitude for organic feel
    smoothAmpRef.current = lerp(smoothAmpRef.current, rawAmp, 0.15);
    const amp = smoothAmpRef.current;

    const freqBins = getFreqBins(analyserRef.current, fftDataRef.current, NUM_POINTS);

    // Breathing fallback when idle or no analyser
    const breatheAmp = vis.breathe
      ? 0.03 + 0.02 * Math.sin(t * 0.3 * TWO_PI)
      : 0;

    const effectiveAmp = Math.max(amp, breatheAmp);

    // ── Clear ──
    ctx.clearRect(0, 0, w, h);

    // Base radius
    const baseR = w * 0.28;

    // ── Layer 1: Outer glow ──
    if (currentState !== "idle") {
      const glowR = baseR * (1.8 + effectiveAmp * 0.6);
      const glow = ctx.createRadialGradient(cx, cy, baseR * 0.5, cx, cy, glowR);
      glow.addColorStop(0, vis.glowColor);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }

    // ── Layer 2: Ring ──
    ringAngleRef.current += vis.ringSpeed * dt;
    const ringR = baseR * (1.15 + effectiveAmp * 0.1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ringAngleRef.current);

    // Dashed ring
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, TWO_PI);
    ctx.strokeStyle = vis.ringColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Second ring (offset)
    if (currentState === "thinking" || currentState === "speaking") {
      ctx.beginPath();
      ctx.arc(0, 0, ringR * 1.08, 0, TWO_PI);
      ctx.strokeStyle = vis.ringColor.replace(/[\d.]+\)$/, `${vis.ringAlpha * 0.5})`);
      ctx.lineWidth = 0.8;
      ctx.setLineDash([4, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();

    // ── Layer 3: Core sphere with organic deformation ──
    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    const deformStrength = (currentState === "listening" || currentState === "speaking") ? 0.15 : 0.03;

    for (let i = 0; i <= NUM_POINTS; i++) {
      const idx = i % NUM_POINTS;
      const angle = (idx / NUM_POINTS) * TWO_PI - Math.PI / 2;

      // Displace radius by frequency bin + slow wobble
      const binVal = freqBins[idx] || 0;
      const wobble = Math.sin(t * 1.5 + idx * 0.7) * 0.015;
      const displacement = 1 + binVal * deformStrength + wobble + effectiveAmp * 0.05;
      const r = baseR * displacement;

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Bezier curve between points for smooth organic shape
        const prevAngle = ((idx - 1 + NUM_POINTS) % NUM_POINTS / NUM_POINTS) * TWO_PI - Math.PI / 2;
        const prevBin = freqBins[(idx - 1 + NUM_POINTS) % NUM_POINTS] || 0;
        const prevDisp = 1 + prevBin * deformStrength + Math.sin(t * 1.5 + (idx - 1) * 0.7) * 0.015 + effectiveAmp * 0.05;
        const prevR = baseR * prevDisp;

        const midAngle = (prevAngle + angle) / 2;
        const cpR = (prevR + r) / 2 * 1.035; // slight outward bulge

        const cpx = Math.cos(midAngle) * cpR;
        const cpy = Math.sin(midAngle) * cpR;

        ctx.quadraticCurveTo(cpx, cpy, x, y);
      }
    }
    ctx.closePath();

    // Fill with radial gradient
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, baseR * 1.1);
    coreGrad.addColorStop(0, vis.coreColor.replace(/[\d.]+\)$/, `${parseFloat(vis.coreColor.match(/[\d.]+\)$/)?.[0] || "0.2") * 2})`));
    coreGrad.addColorStop(0.6, vis.coreColor);
    coreGrad.addColorStop(1, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Subtle inner highlight
    const highlight = ctx.createRadialGradient(-baseR * 0.2, -baseR * 0.2, 0, 0, 0, baseR * 0.6);
    highlight.addColorStop(0, "rgba(255,255,255,0.06)");
    highlight.addColorStop(1, "transparent");
    ctx.fillStyle = highlight;
    ctx.fill();

    ctx.restore();

    // ── Layer 4: Inner element ──
    if (currentState === "idle") {
      // Mercury glyph ☿
      ctx.save();
      ctx.font = `${baseR * 0.45}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText("\u263F", cx, cy + 2);
      ctx.restore();
    } else if (currentState === "listening" || currentState === "speaking") {
      // Mini waveform bars inside the orb
      const barCount = 5;
      const barW = baseR * 0.08;
      const barGap = barW * 1.2;
      const totalW = barCount * barW + (barCount - 1) * barGap;
      const startX = cx - totalW / 2;

      ctx.save();
      for (let i = 0; i < barCount; i++) {
        const binIdx = Math.floor((i / barCount) * (freqBins.length - 1));
        const val = freqBins[binIdx] || 0;
        const barH = Math.max(barW, baseR * 0.5 * (val + 0.1));
        const x = startX + i * (barW + barGap);
        const y = cy - barH / 2;

        ctx.fillStyle = currentState === "listening"
          ? `rgba(78,168,255,${0.3 + val * 0.5})`
          : `rgba(78,168,255,${0.4 + val * 0.5})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (currentState === "thinking") {
      // Spinning dots
      const dotCount = 3;
      ctx.save();
      for (let i = 0; i < dotCount; i++) {
        const angle = ringAngleRef.current * 2 + (i / dotCount) * TWO_PI;
        const dotR = baseR * 0.25;
        const dx = cx + Math.cos(angle) * dotR;
        const dy = cy + Math.sin(angle) * dotR;
        ctx.beginPath();
        ctx.arc(dx, dy, 2.5, 0, TWO_PI);
        ctx.fillStyle = `rgba(185,100,255,${0.4 + i * 0.2})`;
        ctx.fill();
      }
      ctx.restore();
    } else if (currentState === "connecting") {
      // Pulsing dot
      const pulseScale = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.beginPath();
      ctx.arc(cx, cy, 3 + pulseScale * 2, 0, TWO_PI);
      ctx.fillStyle = `rgba(185,100,255,${0.3 + pulseScale * 0.3})`;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ── Canvas setup + animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);

    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [size, draw]);

  return (
    <div
      className="hermes-orb-wrap"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
      aria-label={state === "idle" ? "Start voice conversation" : `Voice ${state} — click to end`}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export default HermesOrb;
