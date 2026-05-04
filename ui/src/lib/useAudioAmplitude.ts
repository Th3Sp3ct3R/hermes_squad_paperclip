/**
 * useAudioAmplitude — hook that watches an HTMLAudioElement and returns the
 * current play state plus an amplitude tracker.
 *
 * Two modes:
 *   1. Real Web Audio analyser (when source is same-origin or CORS-friendly)
 *      → returns 0..1 amplitude updated at ~60fps via requestAnimationFrame
 *   2. Fallback simple-pulse (when AudioContext.createMediaElementSource fails
 *      due to CORS) → returns a slow sine-driven 0.3..1 oscillation while the
 *      audio is playing, so the visualizer still feels alive
 *
 * Designed so the consumer just binds the returned `amplitude` to a CSS scale
 * transform — no consumer-side AudioContext plumbing required.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioAmplitudeState {
  /** True between play and pause/ended. */
  playing: boolean;
  /** Current amplitude 0..1. Updated each animation frame while playing. */
  amplitude: number;
  /** True when real waveform analysis is active (vs fallback simple-pulse). */
  hasAnalyser: boolean;
}

/**
 * Subscribe to an audio element. Returns reactive state and a setter callback
 * to attach to <audio ref={setAudioRef} />.
 */
export function useAudioAmplitude(): AudioAmplitudeState & {
  setAudioRef: (el: HTMLAudioElement | null) => void;
} {
  const [state, setState] = useState<AudioAmplitudeState>({
    playing: false,
    amplitude: 0,
    hasAnalyser: false,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Explicitly Uint8Array<ArrayBuffer> (not ArrayBufferLike) so the type
  // matches AnalyserNode.getByteFrequencyData's expected parameter shape.
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackStartedAt = useRef<number>(0);

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startAnimation = useCallback(() => {
    stopAnimation();

    const tick = () => {
      const analyser = analyserRef.current;
      const data = dataRef.current;

      if (analyser && data) {
        // Real analysis: average of frequency-domain samples → 0..1.
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i]!;
        const avg = sum / data.length / 255;
        setState((prev) => ({ ...prev, amplitude: avg }));
      } else {
        // Fallback: slow sine oscillation while playing.
        const t = (performance.now() - fallbackStartedAt.current) / 1000;
        const amp = 0.4 + 0.3 * Math.sin(t * Math.PI); // 0.1..0.7 over 2s
        setState((prev) => ({ ...prev, amplitude: Math.max(0, amp) }));
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [stopAnimation]);

  const tryAttachAnalyser = useCallback((el: HTMLAudioElement) => {
    if (analyserRef.current) return; // already attached
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      sourceRef.current = source;
      analyserRef.current = analyser;
      // Construct from an explicit ArrayBuffer so TS infers Uint8Array<ArrayBuffer>.
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      setState((prev) => ({ ...prev, hasAnalyser: true }));
    } catch {
      // CORS / cross-origin — fall back to simple-pulse mode. State stays
      // hasAnalyser=false; tick() will branch into the sine fallback.
    }
  }, []);

  const onPlay = useCallback(
    (e: Event) => {
      const el = e.currentTarget as HTMLAudioElement;
      tryAttachAnalyser(el);
      // Resume context (browsers suspend on first construction).
      if (ctxRef.current?.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }
      fallbackStartedAt.current = performance.now();
      setState((prev) => ({ ...prev, playing: true }));
      startAnimation();
    },
    [startAnimation, tryAttachAnalyser],
  );

  const onPause = useCallback(() => {
    stopAnimation();
    setState((prev) => ({ ...prev, playing: false, amplitude: 0 }));
  }, [stopAnimation]);

  const onEnded = onPause;

  const setAudioRef = useCallback(
    (el: HTMLAudioElement | null) => {
      const prev = audioRef.current;
      if (prev && prev !== el) {
        prev.removeEventListener("play", onPlay);
        prev.removeEventListener("pause", onPause);
        prev.removeEventListener("ended", onEnded);
      }
      audioRef.current = el;
      if (el && el !== prev) {
        el.addEventListener("play", onPlay);
        el.addEventListener("pause", onPause);
        el.addEventListener("ended", onEnded);
      }
    },
    [onPlay, onPause, onEnded],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopAnimation();
      const el = audioRef.current;
      if (el) {
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("ended", onEnded);
      }
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        ctxRef.current.close().catch(() => {});
      }
      ctxRef.current = null;
      sourceRef.current = null;
      analyserRef.current = null;
      dataRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, setAudioRef };
}
