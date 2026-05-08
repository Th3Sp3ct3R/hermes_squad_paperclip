/**
 * useHermesVoice — WebSocket + VAD + audio playback hook.
 *
 * Manages the full client-side voice pipeline:
 * 1. Microphone capture via getUserMedia
 * 2. Voice Activity Detection (VAD) via @ricky0123/vad-web
 * 3. WebSocket connection to /api/hermes/voice
 * 4. Audio playback via Web Audio API
 * 5. Interrupt handling (stop playback when user speaks)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWAV, arrayBufferToBase64, base64ToArrayBuffer } from "../lib/audioEncoder";
import { formatHermesMicError } from "../lib/hermes-mic-errors";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface ServerMessage {
  type: "transcription" | "thinking" | "audio_chunk" | "audio_end" | "interrupted" | "error" | "ready";
  text?: string;
  data?: string;
  index?: number;
  fullText?: string;
  partialText?: string;
  message?: string;
  confidence?: number;
}

export interface HermesVoiceOptions {
  /** Voice preset to use */
  preset?: "narration" | "status" | "psychopomp" | "trickster";
  /** Called when transcription is received */
  onTranscription?: (text: string) => void;
  /** Called when Hermes responds with text */
  onResponse?: (text: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useHermesVoice(options: HermesVoiceOptions = {}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [lastTranscription, setLastTranscription] = useState("");
  const [lastResponse, setLastResponse] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const vadRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ─── WebSocket connection ─────────────────────────────────

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/hermes/voice`);

    ws.onopen = () => {
      setIsConnected(true);
      // Send config if preset specified
      if (options.preset) {
        ws.send(JSON.stringify({ type: "config", preset: options.preset }));
      }
    };

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setState("idle");
      wsRef.current = null;
    };

    ws.onerror = () => {
      options.onError?.("WebSocket connection failed");
      setIsConnected(false);
      setState("idle");
    };

    wsRef.current = ws;
  }, [options.preset]);

  // ─── Handle server messages ───────────────────────────────

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "ready":
        setState("listening");
        break;

      case "transcription":
        setLastTranscription(msg.text ?? "");
        options.onTranscription?.(msg.text ?? "");
        break;

      case "thinking":
        setState("thinking");
        break;

      case "audio_chunk":
        if (msg.data) {
          setState("speaking");
          isPlayingRef.current = true;
          const audioData = base64ToArrayBuffer(msg.data);
          audioQueueRef.current.push(audioData);
          playNextChunk();
        }
        break;

      case "audio_end":
        setLastResponse(msg.fullText ?? "");
        options.onResponse?.(msg.fullText ?? "");
        // Wait for queue to drain, then return to listening
        const checkDone = () => {
          if (audioQueueRef.current.length === 0 && !currentSourceRef.current) {
            isPlayingRef.current = false;
            setState("listening");
          } else {
            setTimeout(checkDone, 100);
          }
        };
        checkDone();
        break;

      case "interrupted":
        stopPlayback();
        setLastResponse(msg.partialText ?? "");
        setState("listening");
        break;

      case "error":
        options.onError?.(msg.message ?? "Unknown error");
        setState("listening");
        break;
    }
  }, [options.onTranscription, options.onResponse, options.onError]);

  // ─── Audio playback ───────────────────────────────────────

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 44100 });
    }
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback(async () => {
    if (currentSourceRef.current) return; // Already playing
    const chunk = audioQueueRef.current.shift();
    if (!chunk) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();

      const audioBuffer = await ctx.decodeAudioData(chunk.slice(0)); // slice to avoid detach
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      currentSourceRef.current = source;

      source.onended = () => {
        currentSourceRef.current = null;
        playNextChunk(); // Play next in queue
      };

      source.start();
    } catch {
      // If decode fails (partial chunk), skip and try next
      currentSourceRef.current = null;
      playNextChunk();
    }
  }, [getAudioContext]);

  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  // ─── Microphone + VAD ─────────────────────────────────────

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Dynamic import of VAD (heavy ONNX model, no shipped types)
      const vadModule = await import("@ricky0123/vad-web") as any;
      const MicVAD = vadModule.MicVAD;

      const vad = await MicVAD.new({
        onSpeechStart: () => {
          // If bot is speaking, interrupt it
          if (isPlayingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "interrupt" }));
            stopPlayback();
            setState("listening");
          }
        },
        onSpeechEnd: (audio: Float32Array) => {
          // Encode to WAV and send to server
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const wavBuffer = encodeWAV(audio, 16000);
            const base64 = arrayBufferToBase64(wavBuffer);
            wsRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
          }
        },
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.4,
        minSpeechFrames: 5,
        preSpeechPadFrames: 10,
        redemptionFrames: 8,
      });

      vad.start();
      vadRef.current = vad;
      connect();
    } catch (err) {
      options.onError?.(formatHermesMicError(err));
      setState("idle");
    }
  }, [connect, stopPlayback, options.onError]);

  // ─── Cleanup ──────────────────────────────────────────────

  const disconnect = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    stopPlayback();
    audioContextRef.current?.close();
    audioContextRef.current = null;

    wsRef.current?.close();
    wsRef.current = null;

    setState("idle");
    setIsConnected(false);
  }, [stopPlayback]);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  // ─── Public API ───────────────────────────────────────────

  return {
    state,
    isConnected,
    lastTranscription,
    lastResponse,
    startListening,
    disconnect,
    stopPlayback,
  };
}
