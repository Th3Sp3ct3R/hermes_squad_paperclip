/**
 * Hermes Chat — text-based API endpoint.
 *
 * POST /api/hermes/chat
 * Body: { message: string }
 * Returns: { response: string, model: string }
 *
 * Used by the HermesChat UI when voice isn't active.
 * Calls OpenRouter with Hermes' voice-mode system prompt.
 */

import { Router } from "express";

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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });
    return;
  }

  conversationHistory.push({ role: "user", content: message.trim() });

  // Keep history manageable
  if (conversationHistory.length > 40) {
    conversationHistory.splice(1, conversationHistory.length - 20);
  }

  try {
    const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
        "X-Title": "Paperclip Hermes Chat",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-preview",
        messages: conversationHistory,
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text().catch(() => `${llmRes.status}`);
      res.status(502).json({ error: `LLM error: ${errText.slice(0, 200)}` });
      return;
    }

    const data = (await llmRes.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
    };

    const responseText = data.choices[0]?.message?.content ?? "";
    conversationHistory.push({ role: "assistant", content: responseText });

    res.json({ response: responseText, model: data.model });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
