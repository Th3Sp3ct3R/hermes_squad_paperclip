/**
 * HermesChat — full conversation UI with text + voice input.
 *
 * A dedicated page for speaking with Hermes. Supports:
 * - Text input (type and send)
 * - Voice input (click mic, speak, auto-sends on silence)
 * - Hermes responds with text + audio playback
 * - Full chat history
 * - Voice orb shows state: idle / listening / thinking / speaking
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { encodeWAV, arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/audioEncoder";

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
// Component
// ─────────────────────────────────────────────────────────────

export function HermesChat() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const vadRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Hermes" }]);
  }, [setBreadcrumbs]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, voiceState]);

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

  // ─── Audio playback ───────────────────────────────────────

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 44100 });
    }
    return audioContextRef.current;
  }, []);

  const playNextChunk = useCallback(async () => {
    if (currentSourceRef.current) return;
    const chunk = audioQueueRef.current.shift();
    if (!chunk) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") await ctx.resume();
      const audioBuffer = await ctx.decodeAudioData(chunk.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
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
  }, [getAudioContext]);

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
    } catch {
      setVoiceState("idle");
    }
  }, [connectWs, stopPlayback]);

  const stopVoice = useCallback(() => {
    vadRef.current?.destroy();
    vadRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopPlayback();
    audioContextRef.current?.close();
    audioContextRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setVoiceState("idle");
    setIsConnected(false);
  }, [stopPlayback]);

  // ─── Text input ───────────────────────────────────────────

  const sendText = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", text, timestamp: new Date() },
    ]);
    setInputText("");

    // If WS connected, send as audio-transcribed text
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Send text directly as a "pre-transcribed" message
      wsRef.current.send(JSON.stringify({ type: "text", data: text }));
      setVoiceState("thinking");
    } else {
      // No WS connection — do a simple fetch to OpenRouter
      callLLMDirect(text);
    }
  }, [inputText]);

  const callLLMDirect = useCallback(async (text: string) => {
    setVoiceState("thinking");
    try {
      const res = await fetch("/api/hermes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok) {
        throw new Error(`${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `hermes-${Date.now()}`,
          role: "hermes",
          text: data.response ?? data.text ?? "...",
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "hermes",
          text: "I couldn't reach the server. Make sure it's running.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setVoiceState((s) => (s === "thinking" ? "idle" : s));
    }
  }, []);

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

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">☿</span>
          <div>
            <h1 className="text-lg font-semibold tracking-wide">Hermes</h1>
            <p className="text-xs text-muted-foreground/60">
              {voiceState === "idle" && "Orchestrator · Voice + Text"}
              {voiceState === "connecting" && "Connecting..."}
              {voiceState === "listening" && "Listening..."}
              {voiceState === "thinking" && "Thinking..."}
              {voiceState === "speaking" && "Speaking..."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <span className="text-6xl opacity-30">☿</span>
            <p className="text-muted-foreground/50 text-sm max-w-md">
              Type a message or click the microphone to speak with Hermes.
              He orchestrates the music production pipeline — ask about
              pipeline status, create new concepts, or just talk.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-white/10 text-foreground"
                  : "bg-transparent border border-border/30 text-foreground/90"
              )}
            >
              {msg.role === "hermes" && (
                <span className="text-xs text-muted-foreground/40 block mb-1">☿ Hermes</span>
              )}
              {msg.text}
              {msg.fromVoice && (
                <span className="text-[10px] text-muted-foreground/30 ml-2">voice</span>
              )}
            </div>
          </div>
        ))}

        {voiceState === "thinking" && (
          <div className="flex justify-start">
            <div className="border border-border/30 rounded-xl px-4 py-3 text-sm">
              <span className="text-xs text-muted-foreground/40 block mb-1">☿ Hermes</span>
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-border/30 px-6 py-4">
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          {/* Voice toggle */}
          <button
            onClick={voiceActive ? stopVoice : startVoice}
            className={cn(
              "shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
              voiceActive
                ? "bg-red-500/20 border border-red-500/50 text-red-400"
                : "bg-white/5 border border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
            )}
            title={voiceActive ? "Stop voice" : "Start voice input"}
          >
            {voiceActive ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </button>

          {/* Voice state indicator */}
          {voiceActive && (
            <div className={cn(
              "shrink-0 text-[10px] uppercase tracking-widest font-medium",
              voiceState === "listening" && "text-emerald-400",
              voiceState === "thinking" && "text-amber-400",
              voiceState === "speaking" && "text-blue-400",
              voiceState === "connecting" && "text-muted-foreground/50",
            )}>
              {voiceState}
            </div>
          )}

          {/* Text input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Hermes..."
            className="flex-1 bg-white/5 border border-border/40 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-border/80 transition-colors"
          />

          {/* Send */}
          <button
            onClick={sendText}
            disabled={!inputText.trim()}
            className={cn(
              "shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
              inputText.trim()
                ? "bg-white/10 border border-border/40 text-foreground hover:bg-white/20"
                : "bg-transparent border border-border/20 text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default HermesChat;
