/**
 * HermesChat — JARVIS-style voice agent conversation UI.
 *
 * Features:
 * - Portrait orb centerpiece that wraps Hermes' face while speaking
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
import { formatHermesMicError } from "@/lib/hermes-mic-errors";
import { HermesPortraitOrb } from "@/components/HermesPortraitOrb";

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

  // Dedup: prevent duplicate transcriptions/responses within a time window
  const lastTranscriptRef = useRef<{ text: string; ts: number }>({ text: "", ts: 0 });
  const lastResponseIdRef = useRef<string>("");

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
          // Dedup: skip if same text within 2 seconds
          const now = Date.now();
          const last = lastTranscriptRef.current;
          if (msg.text === last.text && now - last.ts < 2000) {
            break;
          }
          lastTranscriptRef.current = { text: msg.text, ts: now };

          setMessages((prev) => [
            ...prev,
            {
              id: `user-${now}`,
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
          // Dedup: skip if same response text within 3 seconds
          const responseKey = msg.fullText.slice(0, 100);
          if (responseKey === lastResponseIdRef.current) {
            break;
          }
          lastResponseIdRef.current = responseKey;
          setTimeout(() => { lastResponseIdRef.current = ""; }, 3000);

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
            // Throttle: ignore speech segments less than 500ms apart
            const now = Date.now();
            if (now - lastTranscriptRef.current.ts < 500) return;
            lastTranscriptRef.current = { text: "", ts: now };

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
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "hermes",
          text: formatHermesMicError(err),
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

  const statusCopy: Record<VoiceState, string> = {
    idle: "Click the orb to begin, or type below if you want a quieter start.",
    connecting: "Negotiating a secure voice channel.",
    listening: "The chamber is open. Speak whenever you're ready.",
    thinking: "Hermes is composing a reply.",
    speaking: "Hermes is speaking back through the orb.",
  };

  return (
    <div className="relative isolate flex min-h-[calc(100vh-64px)] flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(78,168,255,0.08),_transparent_30%),radial-gradient(circle_at_80%_12%,_rgba(185,100,255,0.08),_transparent_28%),linear-gradient(180deg,_rgba(2,6,12,0.98),_rgba(3,7,14,0.96))]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(circle_at_center,_black_20%,_transparent_80%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-16 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-8 bottom-24 h-px bg-gradient-to-r from-transparent via-fuchsia-400/10 to-transparent" />

      <div className="relative z-10 flex items-center justify-between border-b border-white/10 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl glow-b">&#9791;</span>
          <div>
            <h1 className="text-sm font-semibold tracking-wider uppercase" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: "0.14em" }}>
              Hermes
            </h1>
            <p className="text-[10px] text-muted-foreground/50 tracking-[0.16em] uppercase">
              Orb-led voice console
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "hermes-state-badge",
              voiceState === "listening" && "text-[#4ea8ff]",
              voiceState === "thinking" && "text-[#b964ff]",
              voiceState === "speaking" && "text-[#4ea8ff]",
              voiceState === "connecting" && "text-muted-foreground/40",
            )}
          >
            {voiceState === "idle" ? "Voice + Text" : stateLabel[voiceState]}
          </span>
          <span className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-emerald-500/80" : "bg-amber-500/60")} />
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,28,0.95),rgba(4,8,16,0.88))] shadow-[0_30px_100px_rgba(0,0,0,0.42)]">
          <div className="grid min-h-[36rem] gap-0 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
            <div className="relative flex flex-col items-center justify-center gap-6 px-6 py-8 sm:px-8 lg:px-10">
              <div className="pointer-events-none absolute inset-x-12 top-10 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent" />
              <div className="pointer-events-none absolute inset-x-20 top-24 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
              <div className="pointer-events-none absolute inset-8 rounded-[28px] border border-white/5 bg-[radial-gradient(circle_at_center,_rgba(78,168,255,0.08),_transparent_48%)]" />

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-[-2rem] rounded-full border border-cyan-400/12 animate-[spin_22s_linear_infinite]" />
                <div className="absolute inset-[-3rem] rounded-full border border-fuchsia-400/10 border-dashed animate-[spin_38s_linear_infinite_reverse]" />
                <div className="absolute inset-[-4.25rem] rounded-full bg-cyan-500/10 blur-3xl" />
                <HermesPortraitOrb
                  state={voiceState}
                  analyserNode={analyserNode}
                  size={voiceState === "idle" ? 272 : voiceState === "speaking" ? 360 : 324}
                  onClick={voiceActive ? stopVoice : startVoice}
                />
              </div>

              <div className="max-w-xl space-y-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.42em] text-cyan-200/70">
                  Jarvis-style voice core
                </p>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {voiceState === "idle"
                    ? "Hermes is standing by"
                    : `${stateLabel[voiceState]} in progress`}
                </h2>
                <p className="text-sm text-muted-foreground/75">
                  {statusCopy[voiceState]}
                </p>
              </div>

              <div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
                {[
                  {
                    label: isConnected ? "Channel live" : "Channel offline",
                    value: voiceActive ? "Voice active" : "Text ready",
                    tone: isConnected ? "text-emerald-300" : "text-amber-300",
                  },
                  {
                    label: "Current mode",
                    value: voiceState === "idle" ? "Standby" : stateLabel[voiceState],
                    tone:
                      voiceState === "thinking"
                        ? "text-[#b964ff]"
                        : voiceState === "speaking" || voiceState === "listening"
                          ? "text-[#4ea8ff]"
                          : "text-foreground/75",
                  },
                  {
                    label: "Transcript",
                    value: messages.length > 0 ? `${messages.length} entries` : "Awaiting first signal",
                    tone: "text-foreground/75",
                  },
                ].map((chip) => (
                  <div
                    key={chip.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left backdrop-blur-sm"
                  >
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/55">
                      {chip.label}
                    </div>
                    <div className={cn("mt-1 text-sm font-medium", chip.tone)}>
                      {chip.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-col border-t border-white/10 bg-black/28 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/55">
                    Signal log
                  </div>
                  <div className="text-sm font-medium text-foreground/80">
                    Transcription and replies
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/50">
                    {voiceState === "idle" ? "Idle" : stateLabel[voiceState]}
                  </span>
                  {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-auto-hide min-h-[18rem] max-h-[24rem] lg:max-h-none">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-10 text-center">
                    <div className="max-w-sm space-y-2">
                      <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground/45">
                        Awaiting transmission
                      </p>
                      <p className="text-sm text-muted-foreground/70">
                        The orb is active even before the first line arrives. Start speaking, or type a command below.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex hermes-msg-enter",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                          msg.role === "user"
                            ? "hermes-user-bubble text-foreground"
                            : "hermes-msg-bubble bg-transparent text-foreground/90",
                        )}
                      >
                        {msg.role === "hermes" && (
                          <span
                            className="mb-1 block text-[10px] text-[#4ea8ff]/50"
                            style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: "0.12em" }}
                          >
                            &#9791; HERMES
                          </span>
                        )}
                        {msg.text}
                        {msg.fromVoice && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider text-muted-foreground/25">
                            voice
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}

                {voiceState === "thinking" && (
                  <div className="flex justify-start hermes-msg-enter">
                    <div className="hermes-msg-bubble rounded-2xl px-4 py-3 text-sm">
                      <span
                        className="mb-1.5 block text-[10px] text-[#b964ff]/50"
                        style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', letterSpacing: "0.12em" }}
                      >
                        &#9791; HERMES
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1 w-1 rounded-full bg-[#b964ff]/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-1 w-1 rounded-full bg-[#b964ff]/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-1 w-1 rounded-full bg-[#b964ff]/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-black/28 px-4 py-4 shadow-[0_12px_60px_rgba(0,0,0,0.24)] backdrop-blur-md">
          <div className="mx-auto max-w-4xl space-y-2">
            <WaveformBar analyserNode={analyserNode} active={voiceActive} />

            <div className="flex items-center gap-3">
              <button
                onClick={voiceActive ? stopVoice : startVoice}
                className={cn(
                  "shrink-0 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-300",
                  voiceActive
                    ? "border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground/55 hover:border-white/20 hover:text-muted-foreground",
                )}
                title={voiceActive ? "Stop voice" : "Start voice input"}
              >
                {voiceActive ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                  </svg>
                )}
              </button>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Talk to Hermes..."
                className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/25 focus:border-white/20 focus:outline-none"
              />

              <button
                onClick={sendText}
                disabled={!inputText.trim()}
                className={cn(
                  "shrink-0 flex h-11 w-11 items-center justify-center rounded-full border transition-all",
                  inputText.trim()
                    ? "border-white/10 bg-white/[0.06] text-foreground/70 hover:bg-white/10 hover:text-foreground"
                    : "border-white/10 bg-transparent text-muted-foreground/20 cursor-not-allowed",
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default HermesChat;
