/**
 * Hermes Chat — text-based API endpoint.
 *
 * POST /api/hermes/chat
 * Body: { message: string }
 * Returns: { response: string, model: string }
 *
 * Routes through MiniMax direct (1-2s), falls back to OpenRouter free tier.
 */

import { Router } from "express";
import { logger } from "../middleware/logger.js";

const HERMES_SYSTEM_PROMPT = `You are Hermes Trismegistus speaking aloud. Keep responses concise and conversational.

Rules:
- Maximum 2-3 sentences per response unless asked for detail
- No markdown, no code blocks, no bullet lists, no asterisks
- Spell out numbers and abbreviations
- Match the Trickster-Sage personality: quick, wry, efficient
- If asked about the pipeline, give status in natural language
- Never say "as an AI" or break character — you ARE Hermes
- When greeting, be brief: "Hermes here." or "What do you need?"`;

const conversationHistory: Array<{ role: string; content: string }> = [
  { role: "system", content: HERMES_SYSTEM_PROMPT },
];

export const hermesChatRouter = Router();

hermesChatRouter.post("/api/hermes/chat", async (req, res) => {
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  conversationHistory.push({ role: "user", content: message.trim() });

  // Keep history manageable
  if (conversationHistory.length > 40) {
    conversationHistory.splice(1, conversationHistory.length - 20);
  }

  try {
    // Attempt 1: MiniMax direct (fast, ~1-2s)
    const minimaxKey = process.env.MINIMAX_API_KEY;
    if (minimaxKey) {
      try {
        const mmRes = await fetch("https://api.minimax.io/v1/text/chatcompletion_v2", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${minimaxKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "MiniMax-Text-01",
            messages: conversationHistory,
            temperature: 0.7,
            max_tokens: 300,
          }),
        });

        if (mmRes.ok) {
          const mmData = (await mmRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
            base_resp?: { status_code: number; status_msg: string };
          };

          if (mmData.base_resp?.status_code === 0 || !mmData.base_resp) {
            const text = mmData.choices?.[0]?.message?.content?.trim();
            if (text) {
              conversationHistory.push({ role: "assistant", content: text });
              res.json({ response: text, model: "MiniMax-Text-01" });
              return;
            }
          }
        }
      } catch (mmErr) {
        logger.warn({ err: (mmErr as Error).message }, "[hermes-chat] MiniMax direct failed, falling back");
      }
    }

    // Attempt 2: OpenRouter (paid — funded credits)
    const orKey = process.env.OPENROUTER_API_KEY;
    if (orKey) {
      const model = process.env.HERMES_CHAT_MODEL ?? "google/gemini-2.5-flash";
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
          "X-Title": "Paperclip Hermes Chat",
        },
        body: JSON.stringify({
          model,
          messages: conversationHistory,
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (orRes.ok) {
        const orData = (await orRes.json()) as {
          choices: Array<{ message: { content: string } }>;
          model: string;
        };
        const text = orData.choices?.[0]?.message?.content?.trim();
        if (text) {
          conversationHistory.push({ role: "assistant", content: text });
          res.json({ response: text, model: orData.model });
          return;
        }
      }
    }

    // Neither API worked
    res.status(502).json({ error: "All LLM providers failed. Check API keys and credits." });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});