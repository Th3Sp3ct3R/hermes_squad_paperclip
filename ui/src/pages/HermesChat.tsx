/**
 * HermesChat — JARVIS-style voice agent conversation UI.
 *
 * Features:
 * - Canvas2D audio-reactive orb (HermesOrb) as centerpiece
 * - Inline waveform bar in the input area during active voice
 * - Text + voice input with VAD auto-detection
 * - Hermes responds with text + streamed audio playback
 * - AnalyserNode wired to both mic input and playback output
 * - Upgraded chat bubbles with glow borders and fade-in animation
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { encodeWAV, arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/audioEncoder";
import { HermesOrb } from "@/components/HermesOrb";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface ChatMessage {
  id: string;
  role: "user" | "hermes";
  text: string;
  timestamp: Date;
  fromVoice?: boolean;
}

interface ServerMessage {
  type: "transcription" | "thinking" | "audio_chunk" | "audio_end" | "interrupted" | "error" | "ready";
  text?: string;
  data?: string;
  index?: number;
  fullText?: string;
  partialText?: string;
  message?: string;
}

// ─────────────────────────────────────────────────────────────
// Inline Waveform Bar (Canvas2D)
// ─────────────────────────────────────────────────────────────

function WaveformBar({ analyserNode, active }: { analyserNode: AnalyserNode | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (analyserNode) {
      dataRef.current = new Uint8Array(new ArrayBuffer(analyserNode.frequencyBinCount));
    }
  }, [analyserNode]);

  useEffect(() => {
    if (!active || !analyserNode) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const barW = 3;
    const gap = 2;
    const barCount = Math.floor(w / (barW + gap));
    const step = Math.max(1, Math.floor((analyserNode.frequencyBinCount) / barCount));

    const tick = () => {
      const data = dataRef.current;
      if (!data) { rafRef.current = requestAnimationFrame(tick); return; }

      analyserNode.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j]! || 0;
        const val = sum / step / 255;
        const barH = Math.max(2, val * h * 0.85);
        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        // Fade edges
        const edgeFade = Math.min(i / 8, (barCount - 1 - i) / 8, 1);
        const alpha = 0.25 + val * 0.6;

        ctx.fillStyle = `rgba(78,168,255,${alpha * edgeFade})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 1.5);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, analyserNode]);

  if (!active) return null;

  return (
    <div className="hermes-waveform w-full h-10">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function HermesChat() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const vadRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Hermes" }]);
  }, [setBreadcrumbs]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceState]);

  // ─── Audio context + analyser ───────────────────────────────

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 44100 });
    }
    return audioContextRef.current;
  }, []);

  const getAnalyser = useCallback(() => {
    if (!analyserRef.current) {
      const ctx = getAudioContext();
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.75;
      analyserRef.current = node;
      setAnalyserNode(node);
    }
    return analyserRef.current;
  }, [getAudioContext]);

  /** Connect mic stream to analyser for visual feedback during listening. */
  const connectMicToAnalyser = useCallback((stream: MediaStream) => {
    try {
      const ctx = getAudioContext();
      const analyser = getAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      // Don't connect analyser to destination — we don't want to hear mic echo
      micSourceRef.current = source;
    } catch {
      // Silently fail — visuals degrade gracefully to sine fallback
    }
  }, [getAudioContext, getAnalyser]);

  const disconnectMicFromAnalyser = useCallback(() => {
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
  }, []);

  // ─── WebSocket ────────────────────────────────────────────

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/hermes/voice`);

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setVoiceState("idle");
    };
    ws.onerror = () => setIsConnected(false);

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      handleServerMessage(msg);
    };

    wsRef.current = ws;
  }, []);

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "ready":
        setVoiceState("listening");
        break;

      case "transcription":
        if (msg.text) {
          setMessages((prev) => [
            ...prev,
            {
              id: `user-${Date.now()}`,
              role: "user",
              text: msg.text!,
              timestamp: new Date(),
              fromVoice: true,
            },
          ]);
        }
        break;

      case "thinking":
        setVoiceState("thinking");
        break;

      case "audio_chunk":
        if (msg.data) {
          setVoiceState("speaking");
          isPlayingRef.current = true;
          const audioData = base64ToArrayBuffer(msg.data);
          audioQueueRef.current.push(audioData);
          playNextChunk();
        }
        break;

      case "audio_end":
        if (msg.fullText) {
          setMessages((prev) => [
            ...prev,
            {
              id: `hermes-${Date.now()}`,
              role: "hermes",
              text: msg.fullText!,
              timestamp: new Date(),
            },
          ]);
        }
        const checkDone = () => {
          if (audioQueueRef.current.length === 0 && !currentSourceRef.current) {
            isPlayingRef.current = false;
            setVoiceState((s) => (s === "speaking" ? "listening" : s));
          } else {
            setTimeout(checkDone, 100);
          }
        };
        checkDone();
        break;

      case "interrupted":
        stopPlayback();
        if (msg.partialText) {
          setMessages((prev) => [
            ...prev,
            {
              id: `hermes-${Date.now()}`,
              role: "hermes",
              text: msg.partialText! + " ...",
              timestamp: new Date(),
            },
          ]);
        }
        setVoiceState("listening");
        break;

      case "error":
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "hermes",
            text: `Error: ${msg.message}`,
            timestamp: new Date(),
          },
        ]);
        setVoiceState((s) => (s !== "idle" ? "listening" : s));
        break;
    }
  }, []);

  // ─── Audio playback (with analyser) ─────────────────────────

  const playNextChunk = useCallback(async () => {
    if (currentSourceRef.current) return;
    const chunk = audioQueueRef.current.shift();
    if (!chunk) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const analyser = getAnalyser();
      const audioBuffer = await ctx.decodeAudioData(chunk.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Route through analyser for visual feedback during speaking
      source.connect(analyser);
      analyser.connect(ctx.destination);

      currentSourceRef.current = source;
      source.onended = () => {
        currentSourceRef.current = null;
        playNextChunk();
      };
      source.start();
    } catch {
      currentSourceRef.current = null;
      playNextChunk();
    }
  }, [getAudioContext, getAnalyser]);

  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* already stopped */ }
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  // ─── Voice (mic + VAD) ────────────────────────────────────

  const startVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Wire mic to analyser for orb visualization
      connectMicToAnalyser(stream);

      const vadModule = await import("@ricky0123/vad-web") as any;
      const MicVAD = vadModule.MicVAD;

      const vad = await MicVAD.new({
        onSpeechStart: () => {
          if (isPlayingRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "interrupt" }));
            stopPlayback();
            setVoiceState("listening");
          }
        },
        onSpeechEnd: (audio: Float32Array) => {
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
      connectWs();
      setVoiceState("connecting");
    } catch (err) {
      console.error("[HermesChat] startVoice failed:", err);
      const msg = (err as Error)?.message ?? String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "hermes",
          text: `Voice init failed: ${msg}. Try using text input instead.`,
          timestamp: new Date(),
        },
      ]);
      setVoiceState("idle");
    }
  }, [connectWs, stopPlayback, connectMicToAnalyser]);

  const stopVoice = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    disconnectMicFromAnalyser();
    stopPlayback();
    // Reset analyser
    analyserRef.current = null;
    setAnalyserNode(null);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setVoiceState("idle");
    setIsConnected(false);
  }, [stopPlayback, disconnectMicFromAnalyser]);

  // ─── Text input ───────────────────────────────────────────

  const sendText = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", text, timestamp: new Date() },
    ]);
    setInputText("");

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/hermes/voice`);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "text", data: text }));
        setVoiceState("thinking");
      };
      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        handleServerMessage(msg);
      };
      ws.onclose = () => { setIsConnected(false); setVoiceState("idle"); };
      ws.onerror = () => { setIsConnected(false); };
      wsRef.current = ws;
    } else {
      wsRef.current.send(JSON.stringify({ type: "text", data: text }));
      setVoiceState("thinking");
    }
  }, [inputText, handleServerMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  // ─── Cleanup ──────────────────────────────────────────────

  useEffect(() => {
    return () => { stopVoice(); };
  }, [stopVoice]);

  // ─── Render ───────────────────────────────────────────────

  const voiceActive = voiceState !== "idle";

  const stateLabel: Record<VoiceState, string> = {
    idle: "",
    connecting: "Establishing link",
    listening: "Listening",
    thinking: "Processing",
    speaking: "Speaking",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/20">
        <div className="flex items-center gap-3">
          <span className="text-xl glow-b">&#9791;</span>
          <div>
            <h1 className="text-sm font-semibold tracking-wider uppercase" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: '0.14em' }}>
              Hermes
            </h1>
            <p className="text-[10px] text-muted-foreground/50 tracking-wide">
              {voiceState === "idle" ? "Voice + Text" : stateLabel[voiceState]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {voiceActive && (
            <span className={cn(
              "hermes-state-badge",
              voiceState === "listening" && "text-[#4ea8ff]",
              voiceState === "thinking" && "text-[#b964ff]",
              voiceState === "speaking" && "text-[#4ea8ff]",
              voiceState === "connecting" && "text-muted-foreground/40",
            )}>
              {stateLabel[voiceState]}
            </span>
          )}
          {isConnected && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
          )}
        </div>
      </div>

      {/* Messages + Orb */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 scrollbar-auto-hide">
        {/* Empty state — orb is the hero */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <HermesOrb
              state={voiceState}
              analyserNode={analyserNode}
              size={220}
              onClick={voiceActive ? stopVoice : startVoice}
            />

            <div className="space-y-1.5 mt-2">
              <p className="text-muted-foreground/60 text-xs font-medium tracking-wide">
                {voiceState === "idle" && "Click the orb to speak"}
                {voiceState === "connecting" && "Establishing connection..."}
                {voiceState === "listening" && "Listening \u2014 speak now"}
                {voiceState === "thinking" && "Processing..."}
                {voiceState === "speaking" && "Hermes is speaking"}
              </p>
              {voiceState === "idle" && (
                <p className="text-muted-foreground/25 text-[11px] max-w-xs">
                  Or type below. Voice mode auto-detects speech and Hermes responds aloud.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Compact orb when messages exist */}
        {messages.length > 0 && (
          <div className="flex justify-center py-2">
            <HermesOrb
              state={voiceState}
              analyserNode={analyserNode}
              size={80}
              onClick={voiceActive ? stopVoice : startVoice}
            />
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex hermes-msg-enter",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "hermes-user-bubble text-foreground"
                  : "hermes-msg-bubble bg-transparent text-foreground/90"
              )}
            >
              {msg.role === "hermes" && (
                <span className="text-[10px] text-[#4ea8ff]/50 block mb-1" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: '0.12em' }}>
                  &#9791; HERMES
                </span>
              )}
              {msg.text}
              {msg.fromVoice && (
                <span className="text-[9px] text-muted-foreground/25 ml-2 uppercase tracking-wider">voice</span>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {voiceState === "thinking" && (
          <div className="flex justify-start hermes-msg-enter">
            <div className="hermes-msg-bubble rounded-xl px-4 py-3 text-sm">
              <span className="text-[10px] text-[#b964ff]/50 block mb-1.5" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: '0.12em' }}>
                &#9791; HERMES
              </span>
              <span className="inline-flex gap-1.5 items-center">
                <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Waveform + Input bar */}
      <div className="border-t border-border/20 px-6 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Waveform bar — visible when voice is active */}
          <WaveformBar analyserNode={analyserNode} active={voiceActive} />

          <div className="flex items-center gap-3">
            {/* Voice toggle */}
            <button
              onClick={voiceActive ? stopVoice : startVoice}
              className={cn(
                "shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                voiceActive
                  ? "bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25"
                  : "bg-white/[0.03] border border-border/30 text-muted-foreground/50 hover:border-border/60 hover:text-muted-foreground"
              )}
              title={voiceActive ? "Stop voice" : "Start voice input"}
            >
              {voiceActive ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              )}
            </button>

            {/* Text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Talk to Hermes..."
              className="flex-1 bg-white/[0.03] border border-border/25 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
            />

            {/* Send */}
            <button
              onClick={sendText}
              disabled={!inputText.trim()}
              className={cn(
                "shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                inputText.trim()
                  ? "bg-white/[0.06] border border-border/30 text-foreground/70 hover:bg-white/10 hover:text-foreground"
                  : "bg-transparent border border-border/15 text-muted-foreground/20 cursor-not-allowed"
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HermesChat;
