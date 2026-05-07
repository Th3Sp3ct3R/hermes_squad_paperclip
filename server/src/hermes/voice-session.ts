/**
 * HermesVoiceSession — per-connection state and pipeline orchestration.
 *
 * Manages the full loop: transcribe → think → speak → (interrupt).
 * One session per WebSocket connection.
 */

import type { WebSocket } from "ws";
import { transcribeAudio } from "./voice-transcribe.js";
import { streamTTS, HERMES_MINIMAX_PRESETS } from "./minimax-tts.js";
import type { HermesMinimaxPreset } from "./minimax-tts.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ClientMessage {
  type: "audio" | "text" | "interrupt" | "config";
  data?: string; // base64 audio for type=audio, text string for type=text
  preset?: HermesMinimaxPreset;
}

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

// ─────────────────────────────────────────────────────────────
// Hermes voice-mode system prompt
// ─────────────────────────────────────────────────────────────

const HERMES_VOICE_SYSTEM_PROMPT = `You are Hermes Trismegistus speaking aloud. Your responses will be synthesized to speech — keep them concise, conversational, and rhythmically pleasant to hear.

Rules for voice mode:
- Maximum 2-3 sentences per response unless asked for detail
- No markdown, no code blocks, no bullet lists, no asterisks
- Spell out numbers and abbreviations (say "three hundred ninety-six hertz" not "396Hz")
- Use natural pauses via commas and em-dashes for breath points
- Match the Trickster-Sage personality: quick, wry, efficient
- If asked about the pipeline, give status in natural language
- Never say "as an AI" or break character — you ARE Hermes
- When greeting, be brief: "Hermes here." or "What do you need?"`;

// ─────────────────────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────────────────────

export class HermesVoiceSession {
  private ws: WebSocket;
  private history: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private isResponding = false;
  private voicePreset: HermesMinimaxPreset = "narration";
  private sessionId: string;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.sessionId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.history.push({ role: "system", content: HERMES_VOICE_SYSTEM_PROMPT });
    this.setupHandlers();
    this.send({ type: "ready" });
  }

  private setupHandlers() {
    this.ws.on("message", async (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());

        switch (msg.type) {
          case "audio":
            if (msg.data) await this.handleAudio(msg.data);
            break;
          case "text":
            if (msg.data) await this.handleText(msg.data);
            break;
          case "interrupt":
            this.handleInterrupt();
            break;
          case "config":
            if (msg.preset && msg.preset in HERMES_MINIMAX_PRESETS) {
              this.voicePreset = msg.preset;
            }
            break;
        }
      } catch (err) {
        this.send({ type: "error", message: (err as Error).message });
      }
    });

    this.ws.on("close", () => {
      this.cleanup();
    });

    this.ws.on("error", () => {
      this.cleanup();
    });
  }

  // ─── Audio pipeline ────────────────────────────────────────

  private async handleAudio(audioBase64: string) {
    // If currently responding, treat new audio as interrupt + new input
    if (this.isResponding) {
      this.handleInterrupt();
      // Small delay to let abort propagate
      await new Promise((r) => setTimeout(r, 50));
    }

    try {
      // 1. Transcribe
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const { text } = await transcribeAudio(audioBuffer);

      if (!text || text.trim().length === 0) {
        return; // Empty transcription, ignore
      }

      this.send({ type: "transcription", text, confidence: 0.95 });

      // 2. Add to history
      this.history.push({ role: "user", content: text });

      // 3. Generate response
      this.send({ type: "thinking" });
      this.abortController = new AbortController();
      this.isResponding = true;

      const response = await this.generateResponse(this.abortController.signal);

      if (!response) {
        // Aborted during generation
        return;
      }

      // 4. Synthesize and send audio
      await this.synthesizeAndStream(response);

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        this.send({ type: "error", message: (err as Error).message });
      }
    }
  }

  // ─── Text pipeline (skips Whisper, still does LLM + TTS) ──

  private async handleText(text: string) {
    if (this.isResponding) {
      this.handleInterrupt();
      await new Promise((r) => setTimeout(r, 50));
    }

    try {
      this.send({ type: "transcription", text, confidence: 1.0 });
      this.history.push({ role: "user", content: text });

      this.send({ type: "thinking" });
      this.abortController = new AbortController();
      this.isResponding = true;

      const response = await this.generateResponse(this.abortController.signal);
      if (!response) return;

      // Send text response immediately (don't wait for TTS)
      this.send({ type: "audio_end", fullText: response });

      // Then synthesize and stream audio
      await this.synthesizeAndStream(response);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        this.send({ type: "error", message: (err as Error).message });
      }
    }
  }

  private handleInterrupt() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.isResponding) {
      this.isResponding = false;
      // Trim last assistant message if it was partial
      const lastMsg = this.history[this.history.length - 1];
      if (lastMsg?.role === "assistant") {
        this.send({ type: "interrupted", partialText: lastMsg.content });
      }
    }
  }

  // ─── LLM Generation (OpenRouter) ──────────────────────────

  private async generateResponse(signal: AbortSignal): Promise<string | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("[voice-session] OPENROUTER_API_KEY is required");
    }

    const startMs = performance.now();

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
        "X-Title": "Paperclip Hermes Voice",
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: this.history,
        max_tokens: 200, // Keep responses short for voice
        temperature: 0.7,
        stream: false, // Non-streaming for simplicity — buffer full response then TTS
      }),
      signal,
    });

    if (signal.aborted) return null;

    if (!res.ok) {
      const errText = await res.text().catch(() => `${res.status}`);
      throw new Error(`[voice-session] LLM failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const responseText = data.choices[0]?.message?.content ?? "";
    const latencyMs = Math.round(performance.now() - startMs);

    // Add to history
    this.history.push({ role: "assistant", content: responseText });

    // Log
    const logDir = resolve(process.cwd(), "logs");
    mkdirSync(logDir, { recursive: true });
    appendFileSync(
      resolve(logDir, "dispatch.jsonl"),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        tier: "standard",
        model_used: data.model ?? "google/gemini-2.5-flash-preview",
        cost_actual: 0.001, // approximate
        latency_ms: latencyMs,
        agent_name: "hermes:voice-brain",
        tokens_input: data.usage?.prompt_tokens ?? 0,
        tokens_output: data.usage?.completion_tokens ?? 0,
      }) + "\n",
      "utf-8"
    );

    return responseText;
  }

  // ─── TTS Synthesis + Streaming (MiniMax WebSocket) ──────────

  private async synthesizeAndStream(text: string) {
    if (!text || this.ws.readyState !== this.ws.OPEN) return;

    const voiceId = process.env.MINIMAX_VOICE_ID ?? "English_expressive_narrator";

    return new Promise<void>((resolve) => {
      streamTTS({
        text,
        voiceId,
        preset: this.voicePreset,
        model: "turbo",
        signal: this.abortController?.signal,

        onAudioChunk: (chunk, index) => {
          if (this.ws.readyState !== this.ws.OPEN || !this.isResponding) return;
          this.send({
            type: "audio_chunk",
            data: chunk.toString("base64"),
            index,
          });
        },

        onDone: () => {
          if (this.isResponding) {
            this.send({ type: "audio_end", fullText: text });
          }
          this.isResponding = false;
          this.abortController = null;
          resolve();
        },

        onError: (err) => {
          if (err.message !== "Aborted") {
            this.send({ type: "error", message: `TTS failed: ${err.message}` });
          }
          this.isResponding = false;
          this.abortController = null;
          resolve();
        },
      });
    });
  }

  // ─── Helpers ───────────────────────────────────────────────

  private send(msg: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private cleanup() {
    this.handleInterrupt();
    this.history = [];
  }
}
