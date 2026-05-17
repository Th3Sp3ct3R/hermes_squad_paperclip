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
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { runMetatronOrchestrate } from "../hermes/index.js";
import {
  createMetatronCodingTask,
  ensureMetatronHub,
} from "../services/metatron-hub.js";

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

const SAFE_COMPANY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type MetatronDirectAction =
  | { type: "bootstrap_hub" }
  | { type: "create_coding_task"; message: string };

export function formatMetatronIntent(message: string, companyId?: string): string {
  const trimmedMessage = message.trim();
  const trimmedCompanyId = companyId?.trim();

  if (!trimmedCompanyId || !SAFE_COMPANY_ID_PATTERN.test(trimmedCompanyId)) {
    return trimmedMessage;
  }

  return `[companyId=${trimmedCompanyId}]\n${trimmedMessage}`;
}

export function detectMetatronDirectAction(message: string): MetatronDirectAction | null {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();

  if (
    /\b(bootstrap|initialize|init|seed|setup)\b/.test(normalized) &&
    /\b(the|metatron|hub|command)\b/.test(normalized)
  ) {
    return { type: "bootstrap_hub" };
  }

  const taskMatch = trimmed.match(
    /(?:metatron[,:\s]+)?(?:create|make|open|add)\s+(?:a\s+)?(?:coding\s+)?(?:task|issue)\s+(?:to|for|that)\s+(.+)/i,
  );
  if (taskMatch?.[1]?.trim()) {
    return { type: "create_coding_task", message: taskMatch[1].trim() };
  }

  return null;
}

async function handleCouncilOrchestrate(
  db: Db,
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const { message, companyId } = req.body as { message?: string; companyId?: string };

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const directAction = detectMetatronDirectAction(message);
  if (directAction?.type === "bootstrap_hub") {
    const result = await ensureMetatronHub(db);
    const created =
      result.company.created ||
      result.projects.some((project) => project.created) ||
      result.agents.some((agent) => agent.created);
    res.json({
      response: created
        ? "THE hub is initialized. Metatron seeded the Paperclip-native projects and former-role agents."
        : "THE hub is already initialized. Metatron found the existing projects and agents.",
      model: "deterministic/metatron-hub",
      orchestrated: true,
      action: "bootstrap_hub",
      hub: result,
      total_cost: 0,
      total_steps: 0,
      latency_ms: 0,
    });
    return;
  }

  if (directAction?.type === "create_coding_task") {
    const result = await createMetatronCodingTask(db, {
      message: directAction.message,
      requestedBy: "metatron-orchestrate",
    });
    res.json({
      response: `Created ${result.issue.identifier ?? result.issue.id} in ${result.project.name}, assigned to ${result.assignee.name}.`,
      model: "deterministic/metatron-hub",
      orchestrated: true,
      action: "create_coding_task",
      codingTask: result,
      total_cost: 0,
      total_steps: 0,
      latency_ms: 0,
    });
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    res.status(503).json({
      error: "OPENROUTER_API_KEY required for council orchestration. Set it in server env.",
    });
    return;
  }

  const intent = formatMetatronIntent(message, companyId);

  try {
    const result = await runMetatronOrchestrate(intent);
    res.json({
      response: result.text,
      model: result.model_used,
      orchestrated: true,
      total_cost: result.total_cost,
      total_steps: result.total_steps,
      latency_ms: result.latency_ms,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[metatron-orchestrate] failed");
    res.status(500).json({ error: (err as Error).message });
  }
}

export function hermesChatRouter(db: Db) {
  const router = Router();

  /** Metatron council orchestration — deterministic hub actions first, OpenRouter agent loop otherwise. */
  router.post("/api/metatron/orchestrate", (req, res) => void handleCouncilOrchestrate(db, req, res));
  router.post("/api/hermes/orchestrate", (req, res) => void handleCouncilOrchestrate(db, req, res));

  router.post("/api/hermes/chat", async (req, res) => {
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

  return router;
}