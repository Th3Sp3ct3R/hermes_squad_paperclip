/**
 * MiniMax Music — server-side music generation as a Suno alternative.
 *
 * Endpoint: POST https://api.minimax.io/v1/music_generation
 * Auth:     Authorization: Bearer ${MINIMAX_API_KEY}
 *
 * Models (per MiniMax OpenAPI spec at /v1/music_generation, verified live
 * 2026-05-02):
 *   - music-2.6        — paid, higher RPM
 *   - music-2.6-free   — free-tier, available to all users with API key,
 *                        lower RPM. Default for the autonomous pipeline.
 *   - music-cover      — paid, generates from a reference audio
 *   - music-cover-free — free-tier cover gen
 *
 * The call is effectively synchronous — the API returns the audio (URL or
 * hex string) in the response body once generation completes. No polling
 * required, unlike Suno's feed/v3 cycle.
 */
import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { logUsage } from "./usage-log.js";
import { getStorageService } from "../storage/index.js";
import { assetService } from "./assets.js";

const MINIMAX_BASE = process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io";

export const MINIMAX_MUSIC_MODELS = {
  /** Free tier — default for the autonomous pipeline. Lower RPM. */
  free: "music-2.6-free",
  /** Paid tier — higher RPM, same quality. */
  paid: "music-2.6",
  /** Cover generation from reference audio (free tier). */
  coverFree: "music-cover-free",
  /** Cover generation paid. */
  coverPaid: "music-cover",
} as const;

export type MinimaxMusicModel =
  (typeof MINIMAX_MUSIC_MODELS)[keyof typeof MINIMAX_MUSIC_MODELS];

export interface MinimaxMusicInput {
  /** Style/mood description (0–2000 chars). What goes into Suno's prompt slot. */
  prompt: string;
  /** Lyrics with [Verse]/[Chorus]/[Bridge] markers (1–3500 chars). */
  lyrics: string;
  /** Defaults to the free-tier model. */
  model?: MinimaxMusicModel | string;
  /** When true, return URL pointing at the audio. When false, hex-encoded bytes. */
  outputUrl?: boolean;
  /** Audio settings — sample rate, bitrate, format. */
  audioSetting?: {
    sampleRate?: number;
    bitrate?: number;
    format?: "mp3" | "wav" | "pcm";
  };
  /** Lyric optimizer flag (MiniMax's default is false). */
  lyricsOptimizer?: boolean;
  /** When true, generate an instrumental track (lyrics still influence mood). */
  isInstrumental?: boolean;
  /**
   * Optional context for usage tracking. When provided (with db + companyId),
   * a usage log entry will be fired after successful generation.
   */
  context?: {
    db?: Db;
    companyId?: string;
    sunoIssueId?: string;
    agentId?: string;
  };
}

export interface MinimaxMusicResult {
  /** Audio URL (when outputUrl=true) or hex-encoded bytes (when false). */
  audio: string;
  /** True when audio is a URL, false when it's a hex blob. */
  isUrl: boolean;
  /** MiniMax internal data.status. 2 = complete. */
  status: number;
  /** MiniMax base_resp.status_code. 0 = success; non-zero = error. */
  baseStatusCode: number;
  /** MiniMax trace ID — captured from the TOP-LEVEL response (not extra_info). */
  traceId: string | null;
  /** Trace + token info MiniMax returns inside extra_info. */
  extra: Record<string, unknown> | null;
  /** The model actually used. */
  model: string;
  /** Wall-clock duration in ms. */
  elapsedMs: number;
}

/**
 * Known MiniMax base_resp.status_code values, with the action that fixes them.
 * 0 = success. Anything else = surface to caller with the friendly hint.
 *
 * Source: https://www.minimax.io/platform/document/error-code (verified 2026-05-02)
 */
const MINIMAX_STATUS_HINTS: Record<number, string> = {
  1000: "unknown error",
  1001: "request timeout",
  1002: "rate limit exceeded — slow down or upgrade plan",
  1004: "authentication failed — verify MINIMAX_API_KEY is correct",
  1008: "insufficient balance — top up the MiniMax account",
  1013: "internal error — retry with backoff",
  1026: "input contains sensitive content — adjust prompt/lyrics",
  1027: "output flagged as sensitive — adjust prompt/lyrics",
  1039: "tokens exceeded model limit — shorten prompt or lyrics",
  2013: "invalid parameter — check audio_setting / model name",
  2049: "invalid API key — rotate and re-set MINIMAX_API_KEY",
};

function describeMinimaxStatus(code: number, msg: string | undefined): string {
  const hint = MINIMAX_STATUS_HINTS[code];
  if (hint) return `${code} (${hint})${msg ? ` — ${msg}` : ""}`;
  return `${code}${msg ? ` (${msg})` : ""}`;
}

/**
 * Generate a song via MiniMax's music API. Returns the audio URL (or hex)
 * along with metadata. Throws on auth failure, network error, or non-2xx
 * MiniMax response.
 */
export async function generateMinimaxMusic(
  input: MinimaxMusicInput,
): Promise<MinimaxMusicResult> {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) {
    throw new Error(
      "MINIMAX_API_KEY is not configured — set it in the server env to use MiniMax music gen",
    );
  }

  const model = input.model ?? MINIMAX_MUSIC_MODELS.free;
  const outputFormat = input.outputUrl === false ? "hex" : "url";
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    lyrics: input.lyrics,
    output_format: outputFormat,
    stream: false,
  };
  if (input.audioSetting) {
    body.audio_setting = {
      sample_rate: input.audioSetting.sampleRate ?? 44100,
      bitrate: input.audioSetting.bitrate ?? 256000,
      format: input.audioSetting.format ?? "mp3",
    };
  }
  if (input.lyricsOptimizer !== undefined) body.lyrics_optimizer = input.lyricsOptimizer;
  if (input.isInstrumental !== undefined) body.is_instrumental = input.isInstrumental;

  let res: Response;
  try {
    res = await fetch(`${MINIMAX_BASE}/v1/music_generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `MiniMax network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => `${res.status}`);
    throw new Error(
      `MiniMax music HTTP error (${res.status}): ${errorText.slice(0, 600)}`,
    );
  }

  // MiniMax shape (verified live 2026-05-02):
  //   { data: { audio: "...", status: 2 },
  //     trace_id: "abc",                       ← TOP-LEVEL, not inside extra_info
  //     base_resp: { status_code: 0, status_msg: "success" },
  //     extra_info: { audio_length: 10000, audio_sample_rate: 44100, ... } }
  const data = (await res.json()) as {
    data?: { audio?: string; status?: number };
    trace_id?: string;
    base_resp?: { status_code?: number; status_msg?: string };
    extra_info?: Record<string, unknown>;
  };

  const traceId = typeof data?.trace_id === "string" ? data.trace_id : null;
  const baseStatusCode = data?.base_resp?.status_code ?? -1;
  const baseStatusMsg = data?.base_resp?.status_msg;

  // base_resp.status_code is the authoritative success/failure flag — even on
  // HTTP 200, status_code != 0 means the request failed at the model layer
  // (rate limit, auth, sensitive content, etc.). Surface a friendly message.
  if (baseStatusCode !== 0) {
    throw new Error(
      `MiniMax music failed: ${describeMinimaxStatus(baseStatusCode, baseStatusMsg)} ${
        traceId ? `[trace=${traceId}]` : ""
      }`,
    );
  }

  const audio = data?.data?.audio;
  const dataStatus = data?.data?.status ?? -1;
  if (typeof audio !== "string" || audio.length === 0) {
    throw new Error(
      `MiniMax returned no audio (data.status=${dataStatus}, base_resp=${describeMinimaxStatus(baseStatusCode, baseStatusMsg)}) ${
        traceId ? `[trace=${traceId}]` : ""
      }`,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    `[minimax-music] generated model=${model} elapsedMs=${elapsedMs} dataStatus=${dataStatus} baseStatusCode=${baseStatusCode} outputFormat=${outputFormat} traceId=${traceId ?? "?"}`,
  );

  // Fire-and-forget usage logging when context is provided
  if (input.context?.db && input.context?.companyId) {
    logUsage(input.context.db, {
      companyId: input.context.companyId,
      provider: "minimax",
      model,
      callType: "music",
      stage: "musicGen",
      sunoIssueId: input.context.sunoIssueId,
      agentId: input.context.agentId,
      durationMs: elapsedMs,
      statusCode: baseStatusCode,
      success: true,
      metadata: { traceId },
    }).catch(() => {});
  }

  return {
    audio,
    isUrl: outputFormat === "url",
    status: dataStatus,
    baseStatusCode,
    traceId,
    extra: data?.extra_info ?? null,
    model,
    elapsedMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//   Audio persistence — download MiniMax's pre-signed Aliyun OSS URL and
//   write it through paperclip's storage abstraction so the audio survives
//   past the 24-hour OSS expiry. Without this, every MiniMax track in the
//   DB becomes a dead link the next day.
// ─────────────────────────────────────────────────────────────────────────────

export interface PersistMinimaxAudioInput {
  db: Db;
  companyId: string;
  /** The pre-signed Aliyun OSS URL returned by MiniMax. */
  audioUrl: string;
  /** MiniMax traceId, used for the asset filename when present. */
  traceId: string | null;
  /** Optional — agent that triggered the generation, for asset attribution. */
  agentId?: string | null;
  /** Optional — user that triggered the generation. */
  userId?: string | null;
  /**
   * Bytes/asset namespace. Defaults to "music/minimax". Cover-art uses
   * "assets/cover", lyrics use "assets/lyrics", etc.
   */
  namespace?: string;
}

export interface PersistMinimaxAudioResult {
  /** The asset row ID — use this to query metadata later. */
  assetId: string;
  /**
   * Permanent relative path served by /api/assets/:id/content. Stable across
   * MiniMax URL expiry. This is what should be stored in
   * suno_issues.minimax_audio_url instead of the raw Aliyun URL.
   */
  contentPath: string;
  /** sha256 of the audio bytes — useful for dedupe. */
  sha256: string;
  /** Bytes downloaded. */
  byteSize: number;
  /** content-type as detected from the response (defaults to audio/mpeg). */
  contentType: string;
}

/**
 * Download the MiniMax-generated audio from its expiring Aliyun OSS URL and
 * persist the bytes through paperclip's storage service. Inserts an `assets`
 * row so the audio is queryable, deduplicated by sha256, and served via the
 * standard `/api/assets/:id/content` endpoint.
 *
 * Throws if the audioUrl is unreachable or the storage write fails. Callers
 * should treat this as best-effort during the 24h window — once the original
 * URL expires, this function cannot recover the bytes.
 */
export async function persistMinimaxAudio(
  input: PersistMinimaxAudioInput,
): Promise<PersistMinimaxAudioResult> {
  const start = Date.now();
  // 1. Pull the bytes from MiniMax's CDN. Use a generous timeout — the
  // Aliyun OSS pre-signed URLs typically respond within a second, but
  // we keep slack for slow networks.
  const res = await fetch(input.audioUrl, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(
      `[minimax-persist] Failed to fetch audio from MiniMax CDN: ${res.status} ${res.statusText}`,
    );
  }
  const contentType = res.headers.get("content-type") ?? "audio/mpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) {
    throw new Error("[minimax-persist] MiniMax returned empty audio body");
  }

  // 2. Build a deterministic original filename so the asset is recognizable
  // in lists / downloads. Falls back to a timestamp when no traceId.
  const safeTrace = input.traceId
    ? input.traceId.replace(/[^a-zA-Z0-9_-]/g, "")
    : `t${Date.now()}`;
  const originalFilename = `minimax-${safeTrace}.mp3`;

  // 3. Write through paperclip's storage abstraction. Returns provider/key/
  // sha256/byteSize. Local-disk provider writes under the company's bucket;
  // S3/Supabase providers write to their respective buckets.
  const storage = getStorageService();
  const stored = await storage.putFile({
    companyId: input.companyId,
    namespace: input.namespace ?? "music/minimax",
    originalFilename,
    contentType,
    body: buf,
  });

  // 4. Register the asset in the DB so it has a permanent ID and is served
  // via /api/assets/:id/content.
  const asset = await assetService(input.db).create(input.companyId, {
    provider: stored.provider,
    objectKey: stored.objectKey,
    contentType: stored.contentType,
    byteSize: stored.byteSize,
    sha256: stored.sha256,
    originalFilename: stored.originalFilename,
    createdByAgentId: input.agentId ?? null,
    createdByUserId: input.userId ?? null,
  });

  logger.info(
    {
      assetId: asset.id,
      sha256: stored.sha256,
      byteSize: stored.byteSize,
      contentType,
      elapsedMs: Date.now() - start,
      traceId: input.traceId,
    },
    "[minimax-persist] Audio persisted to paperclip storage",
  );

  return {
    assetId: asset.id,
    contentPath: `/api/assets/${asset.id}/content`,
    sha256: stored.sha256,
    byteSize: stored.byteSize,
    contentType,
  };
}
