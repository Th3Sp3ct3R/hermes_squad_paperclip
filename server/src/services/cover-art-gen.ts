/**
 * Cover Art Gen — Jophiel's image-rendering service.
 *
 * Primary: MiniMax image-01 (uses MINIMAX_API_KEY, already configured).
 * Fallback: OpenRouter gemini-2.5-flash-image (if OPENROUTER credits available).
 *
 * Returns a data URL (base64) or external URL stored in `sunoIssues.thumbnailUrl`.
 *
 * MiniMax API: POST https://api.minimax.io/v1/image_generation
 *   model: "image-01"
 *   prompt: text (max 1500 chars)
 *   aspect_ratio: "1:1" (square cover art)
 *   response_format: "base64" or "url"
 */
import { logger } from "../middleware/logger.js";

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

export interface CoverArtGenInput {
  prompt: string;
  /** Override model. Default: MiniMax image-01. */
  model?: string;
  /** 1:1 default — square cover. */
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16" | "3:4" | "2:3" | "3:2" | string;
  /** Response format. "base64" returns data URL, "url" returns temporary URL (24h). */
  responseFormat?: "base64" | "url";
  /** Number of images to generate (1-9). Default 1. */
  n?: number;
  /** Auto-optimize prompt via MiniMax. Default false. */
  promptOptimizer?: boolean;
}

export interface CoverArtGenResult {
  /** A `data:image/png;base64,<...>` URL or an external URL depending on format. */
  dataUrl: string;
  /** image/png or image/jpeg etc. */
  mimeType: string;
  /** The model that actually generated the image. */
  model: string;
  /** Not used for MiniMax (kept for interface compatibility). */
  textCaption: string | null;
  /** Wall-clock duration in ms. */
  elapsedMs: number;
}

/**
 * Render cover-art from a text prompt via MiniMax image-01.
 * Falls back to OpenRouter if MiniMax key is missing (unlikely).
 */
export async function generateCoverArt(
  input: CoverArtGenInput,
): Promise<CoverArtGenResult> {
  const minimaxKey = process.env.MINIMAX_API_KEY;

  if (minimaxKey) {
    return generateViaMinimax(input, minimaxKey);
  }

  // Fallback to OpenRouter if no MiniMax key
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return generateViaOpenRouter(input, orKey);
  }

  throw new Error(
    "No image generation API key configured. Set MINIMAX_API_KEY (preferred) or OPENROUTER_API_KEY.",
  );
}

// ─────────────────────────────────────────────────────────────
// MiniMax image-01 (primary)
// ─────────────────────────────────────────────────────────────

async function generateViaMinimax(
  input: CoverArtGenInput,
  apiKey: string,
): Promise<CoverArtGenResult> {
  const model = "image-01";
  const aspectRatio = input.aspectRatio ?? "1:1";
  const responseFormat = input.responseFormat ?? "base64";
  const startedAt = Date.now();

  // MiniMax prompt limit is 1500 chars
  const prompt = input.prompt.slice(0, 1500);

  const body: Record<string, unknown> = {
    model,
    prompt,
    aspect_ratio: aspectRatio,
    response_format: responseFormat,
    n: input.n ?? 1,
  };

  if (input.promptOptimizer) {
    body.prompt_optimizer = true;
  }

  const res = await fetch(`${MINIMAX_BASE}/v1/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `MiniMax image-gen error (${res.status}): ${errorText.slice(0, 600)}`,
    );
  }

  const data = (await res.json()) as {
    id?: string;
    data?: {
      image_urls?: string[];
      image_base64?: string[];
    };
    metadata?: { success_count?: number; failed_count?: number };
    base_resp?: { status_code: number; status_msg: string };
  };

  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax image-gen error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`,
    );
  }

  let imageData: string;
  let mimeType = "image/png";

  if (responseFormat === "base64" && data.data?.image_base64?.[0]) {
    const b64 = data.data.image_base64[0];
    imageData = `data:image/png;base64,${b64}`;
  } else if (data.data?.image_urls?.[0]) {
    imageData = data.data.image_urls[0];
  } else {
    throw new Error("MiniMax image-gen returned no image data");
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    `[cover-art-gen] MiniMax generated model=${model} aspect=${aspectRatio} elapsedMs=${elapsedMs}`,
  );

  return {
    dataUrl: imageData,
    mimeType,
    model: `minimax/${model}`,
    textCaption: null,
    elapsedMs,
  };
}

// ─────────────────────────────────────────────────────────────
// OpenRouter fallback (gemini-2.5-flash-image)
// ─────────────────────────────────────────────────────────────

async function generateViaOpenRouter(
  input: CoverArtGenInput,
  apiKey: string,
): Promise<CoverArtGenResult> {
  const OPENROUTER_BASE =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const model =
    input.model ?? process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";
  const aspectRatio = input.aspectRatio ?? "1:1";
  const startedAt = Date.now();

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
      "X-Title": process.env.OPENROUTER_APP_TITLE ?? "Paperclip Pipeline",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: input.prompt }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: aspectRatio, image_size: "1K" },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `OpenRouter image-gen error (${res.status}): ${errorText.slice(0, 600)}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };

  const message = data?.choices?.[0]?.message;
  const dataUrl = message?.images?.[0]?.image_url?.url;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("OpenRouter image-gen returned no image");
  }

  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const elapsedMs = Date.now() - startedAt;

  logger.info(
    `[cover-art-gen] OpenRouter generated model=${model} aspect=${aspectRatio} elapsedMs=${elapsedMs}`,
  );

  return {
    dataUrl,
    mimeType,
    model,
    textCaption: message?.content ?? null,
    elapsedMs,
  };
}
