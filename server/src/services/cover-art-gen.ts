/**
 * Cover Art Gen — Jophiel's image-rendering service.
 *
 * Calls OpenRouter's `/v1/chat/completions` endpoint with `modalities:
 * ["image", "text"]` to render an image from a text prompt. Returns the
 * data URL (base64-encoded) which can be stored directly in
 * `sunoIssues.thumbnailUrl` (text column accepts any URL).
 *
 * Env:
 *   OPENROUTER_API_KEY        — required (image gen is paid; no :free variant)
 *   OPENROUTER_BASE_URL       — defaults to https://openrouter.ai/api/v1
 *   OPENROUTER_IMAGE_MODEL    — default model (overridable per call)
 *
 * Default model: `google/gemini-2.5-flash-image`. Per-archangel override via
 * `agents.runtimeConfig.imageModel` on the Jophiel agent.
 *
 * Per the OpenRouter Image Generation docs, supported aspect ratios for
 * Gemini include 1:1 (1024×1024 default), 16:9, 4:3, etc. For Suno cover
 * art we use 1:1 to match Suno's own thumbnail format.
 */
import { logger } from "../middleware/logger.js";

const OPENROUTER_BASE =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

const DEFAULT_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

export interface CoverArtGenInput {
  prompt: string;
  /** Defaults to google/gemini-2.5-flash-image. */
  model?: string;
  /** 1:1 default — square cover. Other options: 16:9, 4:3, 9:16, etc. */
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16" | "3:4" | "4:5" | "5:4" | string;
  /** "1K" default. Options: "0.5K", "1K", "2K", "4K". */
  imageSize?: "0.5K" | "1K" | "2K" | "4K" | string;
}

export interface CoverArtGenResult {
  /** A `data:image/<type>;base64,<...>` URL safe to store in <img src=> */
  dataUrl: string;
  /** image/png or image/jpeg etc. */
  mimeType: string;
  /** The model that actually generated the image. */
  model: string;
  /** The accompanying text from the model (model often narrates briefly). */
  textCaption: string | null;
  /** Wall-clock duration in ms. */
  elapsedMs: number;
}

/**
 * Render a cover-art image from a text prompt via OpenRouter.
 *
 * @throws if OPENROUTER_API_KEY missing, network fails, or no image returned.
 */
export async function generateCoverArt(
  input: CoverArtGenInput,
): Promise<CoverArtGenResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured — set it in the server env to use cover-art generation",
    );
  }

  const model = input.model ?? DEFAULT_IMAGE_MODEL;
  const aspectRatio = input.aspectRatio ?? "1:1";
  const imageSize = input.imageSize ?? "1K";
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: input.prompt }],
    modalities: ["image", "text"],
    image_config: {
      aspect_ratio: aspectRatio,
      image_size: imageSize,
    },
  };

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://paperclip.ing",
        "X-Title": process.env.OPENROUTER_APP_TITLE ?? "Paperclip Suno Pipeline",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `OpenRouter image-gen network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

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
        // Per OpenRouter docs: response shape uses snake_case in JSON
        // (TS SDK converts to camelCase). image_url.url is a data URL.
        images?: Array<{
          type?: string;
          image_url?: { url?: string };
        }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const message = data?.choices?.[0]?.message;
  const firstImage = message?.images?.[0];
  const dataUrl = firstImage?.image_url?.url;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error(
      "OpenRouter image-gen returned no image (model may not support image output)",
    );
  }

  // Extract mime type from the data URL prefix: "data:image/png;base64,..."
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] ?? "image/png";

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    `[cover-art-gen] generated model=${model} aspect=${aspectRatio} size=${imageSize} mimeType=${mimeType} elapsedMs=${elapsedMs} dataUrlBytes=${dataUrl.length}`,
  );

  return {
    dataUrl,
    mimeType,
    model,
    textCaption: message?.content ?? null,
    elapsedMs,
  };
}
