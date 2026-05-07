/**
 * HermesFloatingOrb — persistent bottom-right voice widget.
 *
 * Sits in the Layout, visible on every page. Click to expand into a
 * mini chat panel with voice + text input. Orb animates per voice state.
 * Self-contained: owns its own WebSocket, VAD, and audio pipeline.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { arrayBufferToBase64, base64ToArrayBuffer } from "@/lib/audioEncoder";
import { HermesOrb } from "./HermesOrb";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

interface ChatMessage {
  id: string;
  role: "user" | "hermes";
  text: string;
}

interface ServerMessage {
  type: "transcription" | "thinking" | "audio_chunk" | "audio_end" | "interrupted" | "error" | "ready";
  text?: string;
  data?: string;
  fullText?: string;
  partialText?: string;
  message?: string;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function HermesFloatingOrb() {
  const [open, setOpen] = useState(false);
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
  // VAD removed — using push-to-talk via MediaRecorder instead
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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

  const connectMicToAnalyser = useCallback((stream: MediaStream) => {
    try {
      const ctx = getAudioContext();
      const analyser = getAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      micSourceRef.current = source;
    } catch { /* degrade gracefully */ }
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
    ws.onclose = () => { setIsConnected(false); setVoiceState("idle"); };
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
          setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: msg.text! }]);
        }
        break;
      case "thinking":
        setVoiceState("thinking");
        break;
      case "audio_chunk":
        if (msg.data) {
          setVoiceState("speaking");
          isPlayingRef.current = true;
          audioQueueRef.current.push(base64ToArrayBuffer(msg.data));
          playNextChunk();
        }
        break;
      case "audio_end":
        if (msg.fullText) {
          setMessages((prev) => [...prev, { id: `h-${Date.now()}`, role: "hermes", text: msg.fullText! }]);
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
          setMessages((prev) => [...prev, { id: `h-${Date.now()}`, role: "hermes", text: msg.partialText + " ..." }]);
        }
        setVoiceState("listening");
        break;
      case "error":
        setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "hermes", text: `Error: ${msg.message}` }]);
        setVoiceState((s) => (s !== "idle" ? "listening" : s));
        break;
    }
  }, []);

  // ─── Audio playback ─────────────────────────────────────────

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
      source.connect(analyser);
      analyser.connect(ctx.destination);
      currentSourceRef.current = source;
      source.onended = () => { currentSourceRef.current = null; playNextChunk(); };
      source.start();
    } catch {
      currentSourceRef.current = null;
      playNextChunk();
    }
  }, [getAudioContext, getAnalyser]);

  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch { /* */ }
      currentSourceRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  // ─── Voice (push-to-talk via MediaRecorder) ──────────────────

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /** Start recording — call on mouse/touch down on mic button. */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      connectMicToAnalyser(stream);
      connectWs();

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        // Convert to base64 and send
        const buf = await blob.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "audio", data: b64 }));
          setVoiceState("thinking");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setVoiceState("listening");
      setOpen(true);
    } catch (err) {
      console.error("[HermesFloating] mic failed:", err);
      setMessages((prev) => [...prev, {
        id: `e-${Date.now()}`, role: "hermes",
        text: `Mic access failed: ${(err as Error)?.message ?? err}. Use text input.`,
      }]);
      setVoiceState("idle");
      setOpen(true);
    }
  }, [connectWs, connectMicToAnalyser]);

  /** Stop recording — call on mouse/touch up. */
  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    disconnectMicFromAnalyser();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [disconnectMicFromAnalyser]);

  const stopVoice = useCallback(() => {
    stopRecording();
    stopPlayback();
    analyserRef.current = null;
    setAnalyserNode(null);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    setVoiceState("idle");
    setIsConnected(false);
  }, [stopPlayback, stopRecording]);

  // ─── Text input ─────────────────────────────────────────────

  const sendText = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    setInputText("");

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/hermes/voice`);
      ws.onopen = () => { setIsConnected(true); ws.send(JSON.stringify({ type: "text", data: text })); setVoiceState("thinking"); };
      ws.onmessage = (event) => handleServerMessage(JSON.parse(event.data));
      ws.onclose = () => { setIsConnected(false); setVoiceState("idle"); };
      ws.onerror = () => setIsConnected(false);
      wsRef.current = ws;
    } else {
      wsRef.current.send(JSON.stringify({ type: "text", data: text }));
      setVoiceState("thinking");
    }
  }, [inputText, handleServerMessage]);

  // ─── Cleanup ────────────────────────────────────────────────

  useEffect(() => {
    return () => { stopVoice(); };
  }, [stopVoice]);

  // ─── Render ─────────────────────────────────────────────────

  const voiceActive = voiceState !== "idle";

  const stateLabel: Record<VoiceState, string> = {
    idle: "", connecting: "Connecting", listening: "Listening",
    thinking: "Processing", speaking: "Speaking",
  };

  // Collapsed: just the orb
  if (!open) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <HermesOrb
          state={voiceState}
          analyserNode={analyserNode}
          size={64}
          onClick={() => setOpen(true)}
        />
      </div>
    );
  }

  // Expanded: orb + chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <div className="w-80 max-h-[28rem] bg-background/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden">
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <span className="text-sm glow-b">&#9791;</span>
            <span className="text-xs font-medium tracking-wider uppercase" style={{ fontFamily: '"Geist Mono", ui-monospace, monospace' }}>
              Hermes
            </span>
            {voiceActive && (
              <span className={cn(
                "text-[9px] uppercase tracking-widest",
                voiceState === "listening" && "text-[#4ea8ff]",
                voiceState === "thinking" && "text-[#b964ff]",
                voiceState === "speaking" && "text-[#4ea8ff]",
                voiceState === "connecting" && "text-muted-foreground/40",
              )}>
                {stateLabel[voiceState]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/80" />}
            <button
              onClick={() => { stopVoice(); setOpen(false); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xs"
              aria-label="Close Hermes"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[8rem] max-h-[18rem] scrollbar-auto-hide">
          {messages.length === 0 && (
            <p className="text-muted-foreground/30 text-xs text-center py-4">
              Click the orb to speak, or type below.
            </p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed hermes-msg-enter",
                msg.role === "user"
                  ? "hermes-user-bubble text-foreground"
                  : "hermes-msg-bubble text-foreground/90"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
          {voiceState === "thinking" && (
            <div className="flex justify-start hermes-msg-enter">
              <div className="hermes-msg-bubble rounded-lg px-3 py-2">
                <span className="inline-flex gap-1">
                  <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1 h-1 bg-[#b964ff]/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              onMouseDown={voiceState === "listening" ? undefined : startRecording}
              onMouseUp={voiceState === "listening" ? stopRecording : undefined}
              onMouseLeave={voiceState === "listening" ? stopRecording : undefined}
              onTouchStart={voiceState === "listening" ? undefined : (e) => { e.preventDefault(); startRecording(); }}
              onTouchEnd={voiceState === "listening" ? (e) => { e.preventDefault(); stopRecording(); } : undefined}
              className={cn(
                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all select-none",
                voiceState === "listening"
                  ? "bg-red-500/20 border border-red-500/50 text-red-400 scale-110"
                  : "bg-white/[0.03] border border-border/30 text-muted-foreground/50 hover:text-muted-foreground"
              )}
              title="Hold to talk"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            </button>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              placeholder="Talk to Hermes..."
              className="flex-1 bg-white/[0.03] border border-border/25 rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/25 focus:outline-none focus:border-border/50 transition-colors"
            />
            <button
              onClick={sendText}
              disabled={!inputText.trim()}
              className={cn(
                "shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all",
                inputText.trim()
                  ? "bg-white/[0.06] border border-border/30 text-foreground/70 hover:text-foreground"
                  : "bg-transparent border border-border/15 text-muted-foreground/20 cursor-not-allowed"
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3">
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* The orb */}
      <HermesOrb
        state={voiceState}
        analyserNode={analyserNode}
        size={64}
        onClick={voiceActive ? stopVoice : () => setOpen(true)}
      />
    </div>
  );
}

export default HermesFloatingOrb;
