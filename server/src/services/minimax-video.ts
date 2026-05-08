/**
 * MiniMax Video Generation — async video creation from text, image, or subject reference.
 *
 * Endpoints:
 *   POST https://api.minimax.io/v1/video_generation       — create task
 *   GET  https://api.minimax.io/v1/query/video_generation  — poll status
 *   GET  https://api.minimax.io/v1/files/retrieve          — get download URL
 *
 * Models: MiniMax-Hailuo-2.3 (latest), MiniMax-Hailuo-02, S2V-01 (subject ref)
 *
 * Modes:
 *   1. Text-to-Video — prompt only
 *   2. Image-to-Video — first_frame_image + prompt
 *   3. First+Last Frame — first_frame_image + last_frame_image + prompt
 *   4. Subject Reference — subject_reference[{type, image[]}] + prompt
 *
 * Requires MINIMAX_API_KEY in env.
 */

import { logger } from "../middleware/logger.js";
import { logUsage } from "./usage-log.js";

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

export const MINIMAX_VIDEO_MODELS = {
  hailuo23: "MiniMax-Hailuo-2.3",
  hailuo02: "MiniMax-Hailuo-02",
  subjectRef: "S2V-01",
} as const;

export type MinimaxVideoModel = (typeof MINIMAX_VIDEO_MODELS)[keyof typeof MINIMAX_VIDEO_MODELS];

// ─────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────

export interface MinimaxVideoInput {
  /** Text description of the video content and motion. */
  prompt: string;
  /** Model to use. Defaults to MiniMax-Hailuo-2.3. */
  model?: MinimaxVideoModel | string;
  /** Duration in seconds (default 6). */
  duration?: number;
  /** Resolution: "720P" | "1080P" (default "1080P"). */
  resolution?: "720P" | "1080P";
  /** First frame image URL (for image-to-video mode). */
  firstFrameImage?: string;
  /** Last frame image URL (for first+last frame mode). */
  lastFrameImage?: string;
  /** Subject reference for consistent face generation. */
  subjectReference?: Array<{
    type: "character";
    image: string[];
  }>;
  /** Optional context for usage tracking. */
  context?: {
    db?: unknown;
    companyId?: string;
    sunoIssueId?: string;
    agentId?: string;
  };
}

export interface MinimaxVideoResult {
  /** Download URL for the generated video. */
  videoUrl: string;
  /** MiniMax file ID. */
  fileId: string;
  /** Task ID used during generation. */
  taskId: string;
  /** The model used. */
  model: string;
  /** Total elapsed time in ms (submit → download URL ready). */
  elapsedMs: number;
}

// ─────────────────────────────────────────────────────────────
// Core implementation
// ─────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error("MINIMAX_API_KEY is required for video generation");
  return key;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Generate a video via MiniMax. Handles the full async lifecycle:
 * submit task → poll until complete → retrieve download URL.
 *
 * Polling interval: 10s (MiniMax recommended).
 * Timeout: 10 minutes.
 */
export async function generateMinimaxVideo(
  input: MinimaxVideoInput,
): Promise<MinimaxVideoResult> {
  const startedAt = Date.now();
  const model = input.model ?? MINIMAX_VIDEO_MODELS.hailuo23;

  // ── Step 1: Submit task ──
  const payload: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    duration: input.duration ?? 6,
    resolution: input.resolution ?? "1080P",
  };

  if (input.firstFrameImage) payload.first_frame_image = input.firstFrameImage;
  if (input.lastFrameImage) payload.last_frame_image = input.lastFrameImage;
  if (input.subjectReference) payload.subject_reference = input.subjectReference;

  const createRes = await fetch(`${MINIMAX_BASE}/v1/video_generation`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => `${createRes.status}`);
    throw new Error(`MiniMax video task creation failed (${createRes.status}): ${err.slice(0, 400)}`);
  }

  const createData = (await createRes.json()) as {
    task_id: string;
    base_resp?: { status_code: number; status_msg: string };
  };

  if (createData.base_resp?.status_code && createData.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax video error ${createData.base_resp.status_code}: ${createData.base_resp.status_msg}`,
    );
  }

  const taskId = createData.task_id;
  logger.info(`[minimax-video] Task created: ${taskId} (model=${model})`);

  // ── Step 2: Poll for completion ──
  const POLL_INTERVAL_MS = 10_000;
  const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes
  let fileId: string | null = null;

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `${MINIMAX_BASE}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${getApiKey()}` } },
    );

    if (!pollRes.ok) continue; // Retry on transient errors

    const pollData = (await pollRes.json()) as {
      status: string;
      file_id?: string;
      error_message?: string;
      base_resp?: { status_code: number; status_msg: string };
    };

    logger.info(`[minimax-video] Poll ${taskId}: status=${pollData.status}`);

    if (pollData.status === "Success" && pollData.file_id) {
      fileId = pollData.file_id;
      break;
    }

    if (pollData.status === "Fail") {
      throw new Error(
        `MiniMax video generation failed: ${pollData.error_message ?? pollData.base_resp?.status_msg ?? "unknown"}`,
      );
    }
  }

  if (!fileId) {
    throw new Error(`MiniMax video generation timed out after ${MAX_WAIT_MS / 1000}s (task=${taskId})`);
  }

  // ── Step 3: Retrieve download URL ──
  const fileRes = await fetch(
    `${MINIMAX_BASE}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
  );

  if (!fileRes.ok) {
    const err = await fileRes.text().catch(() => `${fileRes.status}`);
    throw new Error(`MiniMax file retrieve failed (${fileRes.status}): ${err.slice(0, 400)}`);
  }

  const fileData = (await fileRes.json()) as {
    file: { download_url: string };
  };

  const videoUrl = fileData.file.download_url;
  const elapsedMs = Date.now() - startedAt;

  logger.info(
    `[minimax-video] Complete: task=${taskId} file=${fileId} elapsed=${elapsedMs}ms`,
  );

  // Log usage if context provided
  if (input.context?.db && input.context?.companyId) {
    try {
      await logUsage(input.context.db as any, {
        companyId: input.context.companyId,
        provider: "minimax",
        model,
        callType: "music" as const,
        stage: "video_generation",
        agentId: input.context.agentId,
        sunoIssueId: input.context.sunoIssueId,
        durationMs: elapsedMs,
        tokensIn: input.prompt.length,
        tokensOut: 0,
        costCents: 0,
        success: true,
      });
    } catch {
      // Don't fail the video gen if logging fails
    }
  }

  return { videoUrl, fileId, taskId, model, elapsedMs };
}
