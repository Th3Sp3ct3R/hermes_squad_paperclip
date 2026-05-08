/**
 * MiniMax Video Agent Templates — pre-styled video generation from assets.
 *
 * Endpoints:
 *   POST https://api.minimax.io/v1/video_template_generation       — create task
 *   GET  https://api.minimax.io/v1/query/video_template_generation  — poll status
 *
 * Unlike standard video gen, template tasks return a direct `video_url`
 * on completion (no file_id → retrieve step needed).
 *
 * Templates accept media_inputs (images/videos) and text_inputs to fill
 * predefined slots. For the template catalog, see:
 * https://platform.minimax.io/docs/faq/video-agent-templates
 *
 * Requires MINIMAX_API_KEY in env.
 */

import { logger } from "../middleware/logger.js";
import { logUsage } from "./usage-log.js";

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface VideoTemplateInput {
  /** MiniMax template ID (e.g. "393769180141805569" for Run for Life). */
  templateId: string;
  /** Media assets (images/video URLs) to fill template slots, in order. */
  mediaInputs: Array<{ value: string }>;
  /** Text inputs for template text placeholders, in order. */
  textInputs?: Array<{ value: string }>;
  /** Optional context for usage tracking. */
  context?: {
    db?: unknown;
    companyId?: string;
    sunoIssueId?: string;
    agentId?: string;
  };
}

export interface VideoTemplateResult {
  /** Direct download URL for the generated video. */
  videoUrl: string;
  /** Task ID used during generation. */
  taskId: string;
  /** Template ID used. */
  templateId: string;
  /** Total elapsed time in ms. */
  elapsedMs: number;
}

// ─────────────────────────────────────────────────────────────
// Core implementation
// ─────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY is required for video template generation");
  return key;
}

/**
 * Generate a video from a MiniMax template. Full async lifecycle:
 * submit → poll → return video URL.
 *
 * Polling interval: 10s. Timeout: 5 minutes.
 */
export async function generateVideoFromTemplate(
  input: VideoTemplateInput,
): Promise<VideoTemplateResult> {
  const startedAt = Date.now();
  const headers = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };

  // ── Step 1: Submit template task ──
  const payload: Record<string, unknown> = {
    template_id: input.templateId,
    media_inputs: input.mediaInputs,
  };
  if (input.textInputs?.length) {
    payload.text_inputs = input.textInputs;
  }

  const createRes = await fetch(`${MINIMAX_BASE}/v1/video_template_generation`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => `${createRes.status}`);
    throw new Error(`MiniMax template task failed (${createRes.status}): ${err.slice(0, 400)}`);
  }

  const createData = (await createRes.json()) as {
    task_id: string;
    base_resp?: { status_code: number; status_msg: string };
  };

  if (createData.base_resp?.status_code && createData.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax template error ${createData.base_resp.status_code}: ${createData.base_resp.status_msg}`,
    );
  }

  const taskId = createData.task_id;
  logger.info(`[minimax-video-template] Task created: ${taskId} (template=${input.templateId})`);

  // ── Step 2: Poll for completion ──
  const POLL_INTERVAL_MS = 10_000;
  const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
  let videoUrl: string | null = null;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `${MINIMAX_BASE}/v1/query/video_template_generation?task_id=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${getApiKey()}` } },
    );

    if (!pollRes.ok) continue;

    const pollData = (await pollRes.json()) as {
      status: string;
      video_url?: string;
      error_message?: string;
      base_resp?: { status_code: number; status_msg: string };
    };

    logger.info(`[minimax-video-template] Poll ${taskId}: status=${pollData.status}`);

    if (pollData.status === "Success" && pollData.video_url) {
      videoUrl = pollData.video_url;
      break;
    }

    if (pollData.status === "Fail") {
      throw new Error(
        `MiniMax template generation failed: ${pollData.error_message ?? pollData.base_resp?.status_msg ?? "unknown"}`,
      );
    }
  }

  if (!videoUrl) {
    throw new Error(`MiniMax template generation timed out (task=${taskId})`);
  }

  const elapsedMs = Date.now() - startedAt;

  logger.info(
    `[minimax-video-template] Complete: task=${taskId} elapsed=${elapsedMs}ms`,
  );

  // Log usage
  if (input.context?.db && input.context?.companyId) {
    try {
      await logUsage(input.context.db as any, {
        companyId: input.context.companyId,
        provider: "minimax",
        model: `template:${input.templateId}`,
        callType: "music" as const,
        stage: "video_template",
        agentId: input.context.agentId,
        sunoIssueId: input.context.sunoIssueId,
        durationMs: elapsedMs,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        success: true,
      });
    } catch {
      // Don't fail the video gen if logging fails
    }
  }

  return { videoUrl, taskId, templateId: input.templateId, elapsedMs };
}
